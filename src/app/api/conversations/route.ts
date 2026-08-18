// Parent view: summaries of past conversations. Admin code only.

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import {
  clearConversationLog,
  deleteConversation,
  loadConversationLog,
} from "@/lib/conversations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin code required" }, { status: 401 });
  }
  return NextResponse.json({ conversations: await loadConversationLog() });
}

/** Delete one summary (?id=...) or the whole log (?all=1). Permanent. */
export async function DELETE(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin code required" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (searchParams.get("all") === "1") {
    await clearConversationLog();
  } else if (id) {
    await deleteConversation(id);
  } else {
    return NextResponse.json({ error: "Pass ?id=<id> or ?all=1" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, conversations: await loadConversationLog() });
}
