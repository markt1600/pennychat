// Persistent conversational memory. Instead of replaying past transcripts —
// which would grow the prompt (and latency) forever — each chat is folded
// into a compact rolling memory file (~300 words) by a fast model AFTER the
// chat ends, and only that file is injected next time. Bounded cost, real
// recall. Single-user app: one person, one memory file.

import { anthropic, assertNotRefusal } from "./claude";
import { config } from "./config";
import { getJSON, setJSON } from "./store";
import type { CallTurn, PersonMemory } from "./types";

const MEMORY_KEY = "memory:primary";
const MAX_SUMMARY_CHARS = 4000;

export async function loadMemory(): Promise<PersonMemory | null> {
  return await getJSON<PersonMemory>(MEMORY_KEY);
}

export async function eraseMemory(): Promise<void> {
  const { store } = await import("./store");
  await store().del(MEMORY_KEY);
}

/**
 * Directly set the memory file text — used to seed the memory before the
 * first chat (or correct it) via the UI. Post-chat rewrites then keep
 * folding new conversations into whatever is written here.
 */
export async function saveMemorySummary(summary: string): Promise<PersonMemory> {
  const prior = await loadMemory();
  const memory: PersonMemory = {
    summary: summary.trim().slice(0, MAX_SUMMARY_CHARS),
    personName: config.user.name,
    conversationCount: prior?.conversationCount ?? 0,
    lastConversationAt: prior?.lastConversationAt ?? new Date().toISOString(),
  };
  await setJSON(MEMORY_KEY, memory);
  return memory;
}

/**
 * Fold a finished chat into the memory file. Runs post-chat (webhook time),
 * so it costs nothing during the conversation. Never throws — a failed
 * update just means the agent remembers a little less.
 */
export async function updateMemoryFromConversation(turns: CallTurn[]): Promise<void> {
  if (turns.length === 0) return;
  const personName = config.user.name;
  try {
    const prior = await loadMemory();
    const transcript = turns
      .map((t) => `${t.speaker === "agent" ? "Agent" : personName}: ${t.text}`)
      .join("\n");

    const client = anthropic();
    const response = await client.messages.create({
      model: config.anthropic.fastModel,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You maintain the compact memory file a friendly chat companion keeps about ${personName}.

Current memory file:
${prior?.summary ?? "(empty — this was the first conversation)"}

Transcript of the conversation that just ended:
${transcript}

Rewrite the memory file. Rules: at most 300 words; plain factual sentences; keep durable facts about ${personName} (school, friends, family, hobbies, likes and dislikes, plans, ongoing situations) and anything worth asking about next time; ${personName}'s messages starting with "[PHOTO]" describe photos ${personName} shared — keep durable facts from them (pets, people, places, things ${personName} made); merge with the existing facts — newest information wins on conflict; drop greetings and small talk; never include the agent's own remarks or the word "agent". Output ONLY the memory file text.`,
        },
      ],
    });
    assertNotRefusal(response);
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) return;

    const memory: PersonMemory = {
      summary: block.text.trim().slice(0, MAX_SUMMARY_CHARS),
      personName,
      conversationCount: (prior?.conversationCount ?? 0) + 1,
      lastConversationAt: new Date().toISOString(),
    };
    await setJSON(MEMORY_KEY, memory);
  } catch (err) {
    console.error("Memory update failed (continuing):", err);
  }
}
