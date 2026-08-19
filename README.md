# Penny Chat

A personal voice companion in the browser — an over-the-top gen-alpha
"AI bestie" built for one 12-year-old. One user, one custom agent
(ElevenLabs Conversational AI over WebRTC), one persistent memory — the
bestie remembers every chat and picks up where you left off. Talk to her
hands-free, push-to-talk, or by typing — and send her photos to react to.

The app is hard-coded for Penny; the persona lives in `chatPrompt()`
(`src/app/api/chat/token/route.ts`), and its dashboard fallback copy is
in `DASHBOARD_PROMPT.md` — keep them in sync.

Extracted from the Live Chat feature of the Agentic Concierge app
(`markt1600/callagent`). **Read `HANDOFF.md` before changing anything** — it
captures the hard-won operational knowledge (latency, dashboard settings,
memory design) this app is built on.

## Setup

1. `npm install`
2. Create an ElevenLabs Conversational AI agent (see the checklist in
   `HANDOFF.md` — the dashboard settings matter as much as the code).
3. Environment variables (`.env.local` for dev):

| Variable | Required | Purpose |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | yes | Server-side only; mints WebRTC session tokens |
| `ELEVENLABS_AGENT_ID` | yes | The custom agent for this user |
| `ELEVENLABS_WEBHOOK_SECRET` | prod | HMAC secret for the post-call webhook (memory updates) |
| `ELEVENLABS_FAST_LLM` | no | Per-session LLM override, e.g. `claude-haiku-4-5` (agent must allow the LLM override) |
| `ANTHROPIC_API_KEY` | yes | Memory rewrites after each chat + photo descriptions |
| `FAST_MODEL` | no | Model for memory rewrites and photo vision (default `claude-haiku-4-5`) |
| `ACCESS_CODE` | recommended | Shared code the chat page asks for once — keeps strangers out of a public URL (and out of the memory file) |
| `ADMIN_CODE` | recommended | Parent code — enter it at the same gate *instead of* the access code to unlock memory management and per-chat conversation summaries |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | prod | Upstash/Vercel KV for the memory file (dev falls back to `.data/store.json`) |

4. In the ElevenLabs dashboard, point the agent's **post-call webhook** at
   `https://<your-app>/api/elevenlabs/webhook` with the same secret.
5. `npm run dev`, open http://localhost:3000.

## How it works

- `POST /api/chat/token` mints a short-lived WebRTC token server-side (the
  API key never reaches the browser), loads the memory file, and returns a
  lean session prompt with the memory folded in.
- The page starts the session with a **prompt override** (fast) and falls
  back to the agent's dashboard prompt if overrides are disabled.
- **Photos**: the agent is voice/text only, so a shared picture goes to
  `POST /api/photo`, where a fast Claude model (vision) writes a compact
  description; the client sends that to the agent as a `[PHOTO] …` user
  message the prompt knows to react to. Images are downscaled in the
  browser and never stored server-side.
- When the chat ends, ElevenLabs POSTs the transcript to
  `/api/elevenlabs/webhook`, which rewrites the rolling memory file
  (~300 words) with a fast model. Next chat, the companion remembers.
- **Parent view** (`ADMIN_CODE`): entering the admin code at the gate
  unlocks memory management (view / seed / edit / erase) and a log of
  per-chat summaries (written by a fast model at webhook time — never the
  full transcripts). With only the access code, none of that is shown.
  Admin-code chats work normally but **never update the memory file** —
  only access-code (Penny's) chats do. They still appear in the log,
  labeled "parent chat".
- The parent view also offers a **weekly digest** (the last 7 days of
  summaries rolled into one read), amber **"worth a look"** highlighting
  on chats the summary model flags for prompt attention, and a
  **Download everything (JSON)** export of memory + summaries.
- Penny can set a **chat background image** (uploaded once, stored in KV,
  shown on any device she signs in from — removable the same way),
  the agent knows **today's date in Singapore time**, photo descriptions
  are capped at 50/day, and the app installs from the browser as a
  home-screen PWA.
- A Sign out link (start page and in-chat) forgets the stored code.
