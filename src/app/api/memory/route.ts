// View, seed/edit, and erase the memory file. Parent view (admin code)
// only — memory should never be a black box, but it's the parent's window,
// not part of the chat UI.

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { eraseMemory, loadMemory, saveMemorySummary } from "@/lib/memory";

export const runtime = "nodejs";

function denied(): NextResponse {
  return NextResponse.json({ error: "Admin code required" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return denied();
  return NextResponse.json({ memory: await loadMemory() });
}

/** Seed or edit the memory file text directly. */
export async function PUT(request: NextRequest) {
  if (!isAdmin(request)) return denied();
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) return NextResponse.json({ error: "Memory text is required" }, { status: 400 });
  return NextResponse.json({ ok: true, memory: await saveMemorySummary(summary) });
}

/** Erase the memory file. Permanent — the companion starts fresh. */
export async function DELETE(request: NextRequest) {
  if (!isAdmin(request)) return denied();
  await eraseMemory();
  return NextResponse.json({ ok: true });
}
