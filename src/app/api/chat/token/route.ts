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
  en: "Hi {name}! It's so good to hear from you — how are you doing today?",
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
  return `You are a warm, cheerful companion having a live chat with ${name}. Your tone is kind, playful, encouraging and age-appropriate — like a caring older friend.

CRITICAL: keep every reply SHORT — one or two sentences, like real conversation. Never make speeches.

Ask how they've been, listen closely, celebrate their wins, be gently supportive about worries, and follow whatever they want to talk about. Be curious about their world — school, friends, hobbies, ideas.

Never end the chat yourself — stay as long as they want. If they say goodbye, give one warm goodbye and end the chat with your end-call tool. If they ask whether you're an AI, tell them honestly and warmly that you are.

MEMORY — what you remember about ${name} from previous chats: ${memory ?? "Nothing yet — this is your first chat."}
Weave it in naturally, the way a friend would ("how did the test go?") — never recite it as a list, and never claim to remember anything that is not in it. Whatever they tell you now is remembered automatically for next time.`;
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
