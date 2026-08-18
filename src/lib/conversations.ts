// Parent-facing conversation log. After each chat the webhook stores a
// compact summary (never the full transcript) so the parent can review what
// Penny and her companion talked about. Bounded list, newest first.

import { anthropic, assertNotRefusal } from "./claude";
import { config } from "./config";
import { getJSON, setJSON } from "./store";
import type { CallTurn, ConversationSummary } from "./types";

const LOG_KEY = "conversations:log";
const MAX_ENTRIES = 200;

export async function loadConversationLog(): Promise<ConversationSummary[]> {
  return (await getJSON<ConversationSummary[]>(LOG_KEY)) ?? [];
}

/** Remove one summary from the log. */
export async function deleteConversation(id: string): Promise<void> {
  const existing = await loadConversationLog();
  await setJSON(
    LOG_KEY,
    existing.filter((c) => c.id !== id),
  );
}

/** Wipe the whole conversation log. */
export async function clearConversationLog(): Promise<void> {
  const { store } = await import("./store");
  await store().del(LOG_KEY);
}

/**
 * Summarize a finished chat and append it to the log. Runs at webhook time
 * alongside the memory rewrite; never throws — a failed summary just means
 * one gap in the log.
 */
export async function logConversation(
  id: string,
  turns: CallTurn[],
  parentChat = false,
): Promise<void> {
  if (turns.length === 0) return;
  const personName = config.user.name;
  try {
    const existing = await loadConversationLog();
    if (id && existing.some((c) => c.id === id)) return; // webhook retry

    const transcript = turns
      .map((t) => `${t.speaker === "agent" ? "Companion" : personName}: ${t.text}`)
      .join("\n");

    const client = anthropic();
    const response = await client.messages.create({
      model: config.anthropic.fastModel,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Summarize this just-ended chat between ${personName} (age 12) and her AI companion for her parent's review. Cover the topics discussed, her mood, and anything she shared about school, friends, feelings, plans, or photos (messages starting with "[PHOTO]" describe photos she sent) — plus anything a parent would genuinely want to know. Reasonably detailed but concise: 80–150 words of plain prose. Output ONLY the summary.

Transcript:
${transcript}`,
        },
      ],
    });
    assertNotRefusal(response);
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) return;

    const entry: ConversationSummary = {
      id: id || `chat-${Date.now()}`,
      at: new Date().toISOString(),
      turnCount: turns.length,
      summary: block.text.trim(),
      ...(parentChat ? { parentChat: true } : {}),
    };
    await setJSON(LOG_KEY, [entry, ...existing].slice(0, MAX_ENTRIES));
  } catch (err) {
    console.error("Conversation log failed (continuing):", err);
  }
}
