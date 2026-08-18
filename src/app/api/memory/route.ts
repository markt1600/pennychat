// View and erase the memory file — memory should never be a black box.

import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { eraseMemory, loadMemory } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  return NextResponse.json({ memory: await loadMemory() });
}

/** Erase the memory file. Permanent — the companion starts fresh. */
export async function DELETE(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  await eraseMemory();
  return NextResponse.json({ ok: true });
}
