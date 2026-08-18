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
