// Client bootstrap: who the app belongs to, whether a code is needed, and
// whether the supplied code is the admin (parent) code. Deliberately
// unauthenticated beyond that — it reveals only the first name, the fact
// that a code exists, and an admin flag that requires the admin code.

import { NextRequest, NextResponse } from "next/server";
import { accessRequired, isAdmin } from "@/lib/access";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    userName: config.user.name,
    accessRequired: accessRequired(),
    admin: isAdmin(request),
  });
}
