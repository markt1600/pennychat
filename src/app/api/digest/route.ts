// Parent view: roll the last 7 days of conversation summaries into one
// short weekly digest. Generated on demand (admin code only) by a fast
// model; parent test chats are excluded.

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { anthropic, assertNotRefusal } from "@/lib/claude";
import { config } from "@/lib/config";
import { loadConversationLog } from "@/lib/conversations";
import { sgToday } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Admin code required" }, { status: 401 });
    }

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = (await loadConversationLog()).filter(
      (c) => !c.parentChat && new Date(c.at).getTime() >= cutoff,
    );
    if (recent.length === 0) {
      return NextResponse.json({ digest: null, chatCount: 0 });
    }

    const entries = recent
      .map(
        (c) =>
          `— ${new Date(c.at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" })}${c.worthAttention ? " (flagged)" : ""}:\n${c.summary}`,
      )
      .join("\n\n");

    const client = anthropic();
    const response = await client.messages.create({
      model: config.anthropic.fastModel,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `Today is ${sgToday()} (Singapore time). Below are per-chat summaries from the past week of chats between ${config.user.name} (age 12) and her AI companion, newest first. Write her parent a weekly digest: what she's been into, recurring themes, her overall mood across the week, notable moments, and anything worth the parent's attention (mention flagged chats first if any). 120–220 words of warm, plain prose. Output ONLY the digest.

${entries}`,
        },
      ],
    });
    assertNotRefusal(response);
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new Error("Could not generate the digest — try again");
    }
    return NextResponse.json({ digest: block.text.trim(), chatCount: recent.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Digest failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
