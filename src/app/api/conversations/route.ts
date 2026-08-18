// Parent view: summaries of past conversations. Admin code only.

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { loadConversationLog } from "@/lib/conversations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin code required" }, { status: 401 });
  }
  return NextResponse.json({ conversations: await loadConversationLog() });
}
