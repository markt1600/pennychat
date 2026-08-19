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

/**
 * A parent-facing summary of one finished chat — reasonably detailed but
 * never the full transcript. Written by a fast model at webhook time.
 */
export interface ConversationSummary {
  id: string;
  at: string;
  turnCount: number;
  summary: string;
  /** True for admin-code (parent) chats — these never update memory. */
  parentChat?: boolean;
  /** Flagged by the summary model: a parent would want to see this soon. */
  worthAttention?: boolean;
}
