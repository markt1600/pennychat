// Client bootstrap: who the app belongs to and whether an access code is
// needed. Deliberately unauthenticated — it reveals only the first name and
// the fact that a code exists.

import { NextResponse } from "next/server";
import { accessRequired } from "@/lib/access";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    userName: config.user.name,
    language: config.user.language,
    accessRequired: accessRequired(),
  });
}
