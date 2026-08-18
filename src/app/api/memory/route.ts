// View and erase the memory file — memory should never be a black box.

import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { eraseMemory, loadMemory, saveMemorySummary } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  return NextResponse.json({ memory: await loadMemory() });
}

/** Seed or edit the memory file text directly. */
export async function PUT(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) return NextResponse.json({ error: "Memory text is required" }, { status: 400 });
  return NextResponse.json({ ok: true, memory: await saveMemorySummary(summary) });
}

/** Erase the memory file. Permanent — the companion starts fresh. */
export async function DELETE(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  await eraseMemory();
  return NextResponse.json({ ok: true });
}
