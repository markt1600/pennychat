// Post-call webhook from ElevenLabs Conversational AI. After a chat ends,
// the full transcript arrives here (HMAC-verified) and is folded into the
// rolling memory file. Configure this URL + secret in the ElevenLabs
// dashboard under the agent's post-call webhook settings.

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logConversation } from "@/lib/conversations";
import { updateMemoryFromConversation } from "@/lib/memory";
import { getJSON, setJSON } from "@/lib/store";

// The memory rewrite is not idempotent — a webhook retry would fold the
// same chat in twice. Track recently processed conversation ids.
const PROCESSED_KEY = "memory:processedConversations";
const PROCESSED_MAX = 50;

export const runtime = "nodejs";
export const maxDuration = 60;

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = config.elevenlabs.webhookSecret;
  if (!secret) return true; // verification disabled (dev)
  if (!header) return false;
  // Header format: t=<unix_ts>,v0=<hex hmac of "<t>.<body>">
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 30 * 60) return false; // stale
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v0));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("elevenlabs-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    type?: string;
    data?: {
      conversation_id?: string;
      transcript?: Array<{ role: string; message?: string | null }>;
      conversation_initiation_client_data?: {
        dynamic_variables?: Record<string, string>;
      };
    };
  };

  if (payload.type !== "post_call_transcription" || !payload.data) {
    return NextResponse.json({ ok: true });
  }

  // Only fold in conversations this app started (the agent could also be
  // used elsewhere — those transcripts are not ours to remember).
  const dynVars = payload.data.conversation_initiation_client_data?.dynamic_variables;
  if (dynVars?.pennychat !== "1") return NextResponse.json({ ok: true });

  const turns = (payload.data.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => ({
      speaker: t.role === "agent" ? ("agent" as const) : ("user" as const),
      text: t.message!,
    }));

  // Parent (admin-code) chats never update the memory file — only Penny's
  // own chats are hers to remember. They're still summarized, labeled.
  const parentChat = dynVars.memory_update === "0";
  const convId = payload.data.conversation_id ?? "";
  if (!parentChat) {
    const processed = (await getJSON<string[]>(PROCESSED_KEY)) ?? [];
    if (!convId || !processed.includes(convId)) {
      await updateMemoryFromConversation(turns);
      if (convId) {
        await setJSON(PROCESSED_KEY, [convId, ...processed].slice(0, PROCESSED_MAX));
      }
    }
  }
  await logConversation(convId, turns, parentChat);
  return NextResponse.json({ ok: true });
}
