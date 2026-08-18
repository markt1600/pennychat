# HANDOFF — everything we learned building Live Chat

This app is extracted from the Live Chat feature of Agentic Concierge
(`markt1600/callagent`). This document captures the operational knowledge
from building and debugging that feature — things that are NOT visible in
the code, or whose *why* matters. Read it before changing the chat flow,
the prompts, or the agent's dashboard configuration.

## 1. Architecture in one paragraph

The browser talks to an ElevenLabs Conversational AI agent directly over
WebRTC using `@elevenlabs/client`. The server's only jobs are: mint the
short-lived conversation token (`GET /v1/convai/conversation/token?agent_id=`
with the `xi-api-key` header — the API key must never reach the browser),
build the session prompt + dynamic variables, and receive the post-call
webhook that folds the transcript into the rolling memory file. There is no
audio proxying and no server in the media path.

## 2. Latency playbook (hard-won)

Perceived lag is dominated, in order, by:

1. **The agent's LLM.** This is the big one. A large model (e.g. a
   Sonnet/Opus-class model) noticeably lags in conversation; a fast model
   (Haiku-class) feels live. Set it in the dashboard, or send it
   per-session via the prompt override (`prompt.llm`) — that's what
   `ELEVENLABS_FAST_LLM` does. The agent must have the **LLM override
   enabled** or the session errors (see fallback below).
2. **Prompt size.** Time-to-first-token scales with prompt length. That's
   why the session prompt here is ~200 words, not the 700-word call prompts
   the original app used. Keep it lean; move durable personality into few
   words, not many. The "one or two sentences per reply" rule also keeps
   TTS turnaround snappy.
3. **TTS model.** Flash (`eleven_flash_v2_5`) is the fastest; set it on the
   agent's voice settings in the dashboard. TTS was NOT the bottleneck when
   we debugged lag — don't start there.

Push-to-talk exists because hands-free VAD adds turn-detection delay and
struggles in noisy rooms: PTT keeps the mic muted between turns
(`setMicMuted`), pings `sendUserActivity()` every 1.5s while held so the
agent won't talk over you, and gives the agent clean digital silence to end
the turn on release. Hands-free is the default; PTT is the noisy-room
fallback.

## 3. ElevenLabs dashboard checklist (per agent)

The dashboard config matters as much as the code. In the agent's
**Settings** (the new UI puts overrides under Settings, not Security):

- **Enable overrides** for: System prompt, First message, Language, and
  (if using `ELEVENLABS_FAST_LLM`) LLM. Without these the per-session
  overrides are rejected — the client catches that and retries without
  overrides, falling back to the dashboard prompt, so chats still work but
  you silently lose the lean prompt + memory injection. If you see generic
  behavior with no memory, check the override toggles first.
- **System tools — enable "End conversation".** Without it the agent
  cannot hang up and will loop goodbyes forever (we watched one repeat its
  sign-off for two minutes into a voicemail). The prompt's "one goodbye,
  then end the chat with your end-call tool" line only works if the tool
  exists. "Detect language" and "Skip turn" are also worth enabling.
- **Voice**: pick the voice, set TTS to Flash for latency.
- **LLM**: fast model (Haiku-class) for conversational feel.
- **Post-call webhook**: point at `/api/elevenlabs/webhook` with the HMAC
  secret in `ELEVENLABS_WEBHOOK_SECRET`. Signature format is
  `t=<ts>,v0=<hmac-sha256 of "<ts>.<body>">` — code already verifies it.
- **Dashboard prompt (fallback path)**: since the app normally overrides
  the prompt per-session, the dashboard prompt only matters when overrides
  are rejected. Make it a copy of the code's `chatPrompt()` using dynamic
  variables: `{{caller_name}}`, `{{memory}}`, `{{call_language}}`,
  `{{first_message}}`. Every dynamic variable referenced by the dashboard
  prompt MUST be sent on every session or initiation fails — the token
  route already sends all of the above.

## 4. Memory design (and why it's shaped this way)

Replaying past transcripts would grow the prompt — and latency — forever.
Instead: after each chat, the webhook hands the transcript to a fast model
that REWRITES a single rolling memory file, capped at ~300 words (4000
chars hard cap as a backstop; raised from the original 130/1500 when the
memory was seeded with a rich profile). Only that file is injected into
the next session. Properties that matter:

- **Bounded**: prompt cost is constant no matter how many chats happen.
- **The cap is deliberate**: big enough for a real person's working
  recall of a friend, small enough that the rewrite model must prioritize
  instead of hoarding stale details, and only ~400 tokens on every
  session start. Tune via the prompt in `src/lib/memory.ts` if the
  companion forgets too much — but remember prompt size is latency.
- **"Newest wins"** on conflict, and the rewrite drops small talk.
- **Injection, two paths**: the override path bakes the memory text into
  the session prompt; the fallback path sends it as the `{{memory}}`
  dynamic variable for the dashboard prompt. Both are always sent.
- **Prompt rules that keep it natural**: weave memory in like a friend
  ("how did the test go?"), never recite it, never claim to remember
  anything not in the file.
- **Transparency**: the UI shows the memory and can erase it. Memory
  should never be a black box — this mattered a lot to the product owner.
- The update runs post-call and never throws; a failed rewrite just means
  the companion remembers a little less.

In the multi-user original, memory was keyed globally by the person's
phone number so calls TO a person and chats BY that person shared one
file, with server-side rules about who may bind a chat to whose memory
(impersonation risk). Single-user here, so one file (`memory:primary`) and
none of that complexity — but if this app ever grows multiple people,
go read `src/lib/memory.ts` and `/api/chat/token` in callagent first.

## 5. Security decisions (keep these)

- **API keys live server-side only.** The browser gets a short-lived
  conversation token, never `ELEVENLABS_API_KEY` or `ANTHROPIC_API_KEY`.
- **Webhook is HMAC-verified** (timing-safe compare, 30-min staleness
  window). An unverified webhook would let anyone write the memory file.
- **The webhook only trusts conversations this app started** — it checks
  the `pennychat: "1"` dynamic variable, so the same agent used elsewhere
  can't pollute the memory.
- **`ACCESS_CODE`** gates every API route (timing-safe compare). Without
  it, anyone who finds the URL chats into the memory file. Set it in
  production. It's a shared code, not real auth — fine for one household,
  not for a multi-user product (callagent uses Google Sign-In for that).
- The Anthropic call checks `stop_reason === "refusal"` and skips the
  memory update rather than storing an error message as "memory".

## 6. SDK specifics that bit us

- `Conversation.startSession({ conversationToken, connectionType:
  "webrtc", overrides, dynamicVariables, textOnly, ... })` — overrides use
  `agent: { language, prompt: { prompt, llm }, firstMessage }`. `language`
  must be typed as the SDK's `Language` type (plain `string` fails the
  build).
- **Always wrap the override session start in try/catch** and retry
  without overrides — agents with overrides disabled reject the session,
  and the error is not obviously about overrides.
- `textOnly: true` for text mode — no mic permission needed.
- Clean up on unmount: `endSession()` + clear the activity-ping interval,
  or a reload leaves a ghost session running.
- Mobile PTT needs `setPointerCapture`, `touchAction: "none"`,
  `userSelect: "none"`, and an `onContextMenu` preventDefault, or
  long-press triggers the context menu instead of talking.

## 7. What was deliberately left out (and where to find it)

All in `markt1600/callagent`:

- **Phone calls** (outbound via ElevenLabs+Twilio, retries, voicemail
  handling, call screening): `src/lib/affirm.ts`, `src/lib/buddy.ts`.
- **Multi-user accounts** (Google Sign-In, per-user data, admin):
  `src/lib/auth.ts`, `src/app/account/`, `src/app/admin/`.
- **Credits/billing**, **friends lists**, **recorded-message calls**
  (Twilio TwiML gather loops), **scheduled calls** (Vercel cron), and the
  **Ah Beng persona** (a second, spicier agent persona — grep
  `ahBengPromptTemplate`).
- The generic KV store (`src/lib/store.ts`) is copied verbatim here:
  Upstash/Vercel KV REST in prod, `.data/store.json` locally.

## 8. Deploy notes

- Built for Vercel: push, connect, set env vars, attach a KV store.
- The webhook route sets `maxDuration = 60` — the memory rewrite happens
  inside the webhook request.
- Local dev works with zero KV config (file-backed store) and no webhook
  secret (verification is skipped when unset) — use ngrok or similar if
  you want real webhook-driven memory updates locally.
