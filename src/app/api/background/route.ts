// Penny's chat background image, stored server-side (KV) so she uploads it
// once and it follows her across devices. Any signed-in user can set it —
// it's her app. Kept small client-side; the size cap here is a backstop
// that also keeps us under the KV request limit.

import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { getJSON, setJSON } from "@/lib/store";

export const runtime = "nodejs";

const BG_KEY = "settings:chatBackground";
// ~675KB of image — comfortably inside Upstash's 1MB request cap.
const MAX_DATA_URL_CHARS = 900_000;

export async function GET(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  return NextResponse.json({ background: (await getJSON<string>(BG_KEY)) ?? null });
}

export async function PUT(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json({ error: "Send the background as a base64 data URL" }, { status: 400 });
  }
  if (image.length > MAX_DATA_URL_CHARS) {
    return NextResponse.json(
      { error: "That image is too big — try a smaller one." },
      { status: 413 },
    );
  }
  await setJSON(BG_KEY, image);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = checkAccess(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  const { store } = await import("@/lib/store");
  await store().del(BG_KEY);
  return NextResponse.json({ ok: true });
}
