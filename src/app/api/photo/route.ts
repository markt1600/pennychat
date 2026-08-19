// Photo sharing. ElevenLabs Conversational AI takes voice/text only, so a
// shared picture goes through Claude vision here first: the browser posts a
// downscaled JPEG, a fast model writes a compact description, and the client
// hands that to the agent as a "[PHOTO] …" user message the session prompt
// knows how to react to. The image itself is never stored server-side.

import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/access";
import { anthropic, assertNotRefusal } from "@/lib/claude";
import { config } from "@/lib/config";
import { sgDateKey } from "@/lib/dates";
import { getJSON, setJSON } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
// ~3MB of image; the client downscales to ~1280px JPEG so real payloads are
// far smaller — this is a backstop, and keeps us under Vercel's body limit.
const MAX_BASE64_CHARS = 4_000_000;
// This route spends Anthropic credits per call — cap it so a leaked access
// code can't run up a bill. Plenty for real use.
const DAILY_PHOTO_LIMIT = 50;

export async function POST(request: NextRequest) {
  try {
    const denied = checkAccess(request);
    if (denied) return NextResponse.json({ error: denied }, { status: 401 });

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const image = typeof body.image === "string" ? body.image : "";
    const match = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(image);
    if (!match) {
      return NextResponse.json({ error: "Send the photo as a base64 data URL" }, { status: 400 });
    }
    const [, mediaType, data] = match;
    if (!(ALLOWED_TYPES as readonly string[]).includes(mediaType)) {
      return NextResponse.json({ error: "That image format isn't supported" }, { status: 400 });
    }
    if (data.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "That photo is too large" }, { status: 400 });
    }

    const limitKey = `ratelimit:photo:${sgDateKey()}`;
    const used = (await getJSON<number>(limitKey)) ?? 0;
    if (used >= DAILY_PHOTO_LIMIT) {
      return NextResponse.json(
        { error: "That's a lot of photos for one day! Try again tomorrow." },
        { status: 429 },
      );
    }
    await setJSON(limitKey, used + 1);

    const client = anthropic();
    const response = await client.messages.create({
      model: config.anthropic.fastModel,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as (typeof ALLOWED_TYPES)[number],
                data,
              },
            },
            {
              type: "text",
              text: `You are the eyes for a voice companion chatting with ${config.user.name}, a 12-year-old who just shared this photo in the chat. Describe it in under 80 words so the companion can react as if it saw the picture itself: what it is, who or what is in it (describe people, never guess real identities), anything notable or funny, any visible text, and the overall vibe. Output ONLY the description.`,
            },
          ],
        },
      ],
    });
    assertNotRefusal(response);
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new Error("Could not read that photo — try another one");
    }
    return NextResponse.json({ description: block.text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Photo description failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
