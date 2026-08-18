/** Languages the chat can run in (ElevenLabs agent language codes). */
export type ChatLanguage = "en" | "zh" | "ja" | "th" | "vi" | "de" | "ko" | "fr";

export const CHAT_LANGUAGES: ChatLanguage[] = ["en", "zh", "ja", "th", "vi", "de", "ko", "fr"];

export const LANGUAGE_NAMES: Record<ChatLanguage, string> = {
  en: "English",
  zh: "Chinese (Mandarin)",
  ja: "Japanese",
  th: "Thai",
  vi: "Vietnamese",
  de: "German",
  ko: "Korean",
  fr: "French",
};

/** One line of a conversation transcript. */
export interface CallTurn {
  speaker: "agent" | "user";
  text: string;
}

/**
 * The rolling memory file — a compact summary (~130 words) rewritten after
 * every chat, never the raw transcripts. See HANDOFF.md for why it's small.
 */
export interface PersonMemory {
  summary: string;
  personName: string;
  conversationCount: number;
  lastConversationAt: string;
}
