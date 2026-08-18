# Penny Chat — project instructions

Personal single-user voice companion app (Next.js 15 + ElevenLabs
Conversational AI over WebRTC + Claude for memory rewrites), extracted from
the Live Chat feature of `markt1600/callagent`.

**Before making any changes: read `HANDOFF.md` in full.** It captures the
operational knowledge this app is built on — the latency playbook, the
ElevenLabs dashboard checklist (overrides, End-conversation tool, webhook),
the memory design and its rationale, the security decisions, and SDK
gotchas. Most of it is not discoverable from the code alone. `README.md`
has the env-var table and setup steps.

## Working rules

- **Verify with a full build before committing**: run `npm run build` and
  read the END of the output (don't grep for "Compiled successfully" —
  compilation can succeed while type-checking fails later in the output).
- Keep API keys server-side only; the browser only ever gets short-lived
  conversation tokens.
- Keep the session prompt lean — prompt size is latency (see HANDOFF §2).
- The memory file stays bounded (~300 words); never switch to replaying
  transcripts into the prompt.
- Every dynamic variable referenced by the agent's dashboard prompt must
  be sent on every session, or session initiation fails.
- If agent behavior changes are needed, remember there are TWO prompt
  paths: the code's `chatPrompt()` (normal) and the dashboard prompt
  (fallback when overrides are disabled). Keep them in sync, and tell the
  user exactly what to paste into the ElevenLabs dashboard — they maintain
  the dashboard by hand.

## Layout

- `src/app/page.tsx` — the whole chat UI (voice hands-free / push-to-talk /
  text, transcript, memory viewer + erase, access-code gate)
- `src/app/api/chat/token/route.ts` — session token + lean prompt + memory
- `src/app/api/elevenlabs/webhook/route.ts` — post-chat memory rewrite
- `src/app/api/memory/route.ts` — view/erase memory
- `src/lib/memory.ts` — the rolling-summary memory design
- `src/lib/access.ts` — ACCESS_CODE gate
- `src/lib/store.ts` — KV (Upstash/Vercel KV in prod, local file in dev)
