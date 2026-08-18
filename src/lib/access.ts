// Optional shared-access-code gate. When ACCESS_CODE is set, every API
// request must carry it in the x-access-code header; the chat page asks for
// it once and remembers it. Timing-safe comparison, no sessions to manage.

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { config } from "./config";

export function accessRequired(): boolean {
  return Boolean(config.accessCode);
}

/** Null when allowed; an error message when denied. */
export function checkAccess(request: NextRequest): string | null {
  if (!config.accessCode) return null;
  const given = request.headers.get("x-access-code") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(config.accessCode);
  if (a.length === b.length && timingSafeEqual(a, b)) return null;
  return "Wrong or missing access code";
}
