// Parent view: download everything the app stores (memory + conversation
// summaries) as one JSON file. Admin code only.

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { loadConversationLog } from "@/lib/conversations";
import { sgDateKey } from "@/lib/dates";
import { loadMemory } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin code required" }, { status: 401 });
  }
  const body = {
    app: "pennychat",
    exportedAt: new Date().toISOString(),
    memory: await loadMemory(),
    conversations: await loadConversationLog(),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="pennychat-export-${sgDateKey()}.json"`,
    },
  });
}
