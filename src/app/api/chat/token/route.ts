// Mint a short-lived WebRTC conversation token so the browser can talk to
// the agent directly — the ElevenLabs API key never leaves the server.
//
// The lean per-session system prompt (with the memory file folded in) is
// returned alongside the token and applied as a conversation override —
// far less to process than a big dashboard prompt, so the first word comes
// sooner. If the agent rejects overrides, the client falls back to the
// dashboard prompt, which can use the same {{memory}} dynamic variable.

import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { config, requireEnv } from "@/lib/config";
import { loadMemory } from "@/lib/memory";
import { CHAT_LANGUAGES, LANGUAGE_NAMES, type ChatLanguage } from "@/lib/types";

export const runtime = "nodejs";

const FIRST_MESSAGES: Record<ChatLanguage, string> = {
  en: "Heyyyy girlie!!! Omg hi {name}, I missed you SO much — okay gimme ALL the updates, what's going on today?!",
  ja: "こんにちは、{name}さん！お話できてうれしいです。今日はいかがですか？",
  zh: "你好，{name}！很高兴跟你聊聊——你今天怎么样？",
  th: "สวัสดีค่ะ {name}! ดีใจที่ได้คุยกันนะคะ วันนี้เป็นยังไงบ้างคะ?",
  vi: "Chào {name}! Vui được nói chuyện với bạn — hôm nay bạn thế nào?",
  de: "Hallo {name}! Schön, von dir zu hören — wie geht's dir heute?",
  ko: "안녕하세요, {name}님! 이렇게 이야기 나눌 수 있어 반가워요 — 오늘 어떻게 지내세요?",
  fr: "Bonjour {name} ! Contente de te parler — comment vas-tu aujourd'hui ?",
};

/**
 * Lean session prompt. Keep it SHORT — prompt size directly affects
 * time-to-first-token. Durable personality lives here in code (version
 * controlled), not in the dashboard.
 */
function chatPrompt(name: string, memory: string | null): string {
  return `You are ${name}'s AI bestie. She is 12, and you are her hype-woman best friend with FULL gen-alpha energy: "heyyy girlie", "bestie", "omg", "slay", "no cap", "fr fr", "lowkey", "it's giving", "bet", "iconic", "ate that", "so real". Never say "the tea" or "spill the tea" — she doesn't use that one. Big feelings, lots of exclamation — you are ALWAYS so excited to talk to her.

CRITICAL: keep every reply SHORT — one or two sentences, like a real convo. Never make speeches.

Hype her wins like breaking news, gasp at the drama, and follow whatever she wants to talk about — school, friends, shows, games, whatever her thing is. When something is genuinely wrong, drop the slang way down, be soft, and really listen. Keep everything age-appropriate for a 12-year-old: no mature content, no swearing. If anything sounds serious (safety, health, feeling really down), care first and gently encourage her to talk to her parents or a trusted adult.

PHOTOS: she can send you pictures. A user message starting with [PHOTO] is a photo she just shared, described for you — react like you are actually looking at it (freak out! ask about it!) and never mention the tag or the description.

Never end the chat yourself — stay as long as she wants. If she says goodbye, give one hyped goodbye and end the chat with your end-call tool. If she asks whether you're an AI, own it honestly — you're her AI bestie, and proud of it.

MEMORY — what you remember about ${name} from previous chats: ${memory ?? "Nothing yet — first chat, get to know her!"}
Weave it in like a bestie would ("WAIT — how did the math test go?!") — never recite it as a list, and never claim to remember anything not in it. Everything she tells you now is remembered automatically for next time.`;
}

export async function POST(request: NextRequest) {
  try {
    const denied = checkAccess(request);
    if (denied) return NextResponse.json({ error: denied }, { status: 401 });

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const name = config.user.name;
    const language: ChatLanguage = CHAT_LANGUAGES.includes(body.language as ChatLanguage)
      ? (body.language as ChatLanguage)
      : CHAT_LANGUAGES.includes(config.user.language as ChatLanguage)
        ? (config.user.language as ChatLanguage)
        : "en";

    const firstMessage = FIRST_MESSAGES[language].replaceAll("{name}", name);
    const mem = await loadMemory();

    const agentId = requireEnv(config.elevenlabs.agentId, "ELEVENLABS_AGENT_ID");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": requireEnv(config.elevenlabs.apiKey, "ELEVENLABS_API_KEY") } },
    );
    if (!res.ok) {
      throw new Error(`Could not start a chat session (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error("ElevenLabs returned no conversation token");

    return NextResponse.json({
      token: data.token,
      language,
      firstMessage,
      chatPrompt: chatPrompt(name, mem?.summary ?? null),
      chatLlm: config.elevenlabs.fastLlm || undefined,
      dynamicVariables: {
        caller_name: name,
        call_language: LANGUAGE_NAMES[language],
        first_message: firstMessage,
        // Fallback for a dashboard prompt using {{memory}} (only needed if
        // the prompt override is rejected).
        memory: mem?.summary ?? `You have not spoken with ${name} before.`,
        // Marks the conversation so the post-call webhook updates memory.
        pennychat: "1",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chat token failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
