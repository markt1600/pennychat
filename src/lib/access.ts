// Shared-code gate with two tiers. ACCESS_CODE lets Penny chat; ADMIN_CODE
// (entered at the same gate, instead of the access code) additionally
// unlocks the parent view: memory management and conversation summaries.
// Timing-safe comparison, no sessions to manage.

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { config } from "./config";

function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function givenCode(request: NextRequest): string {
  return request.headers.get("x-access-code") ?? "";
}

export function accessRequired(): boolean {
  return Boolean(config.accessCode || config.adminCode);
}

/** Null when allowed to chat; an error message when denied. */
export function checkAccess(request: NextRequest): string | null {
  if (!accessRequired()) return null; // open (local dev)
  const given = givenCode(request);
  if (config.accessCode && matches(given, config.accessCode)) return null;
  if (config.adminCode && matches(given, config.adminCode)) return null;
  return "Wrong or missing access code";
}

/**
 * True only for the parent: the admin code was supplied. With no codes
 * configured at all (open local dev) everything is admin; with only an
 * access code configured there is no admin view.
 */
export function isAdmin(request: NextRequest): boolean {
  if (config.adminCode) return matches(givenCode(request), config.adminCode);
  return !config.accessCode;
}

/**
 * True only when the admin code itself was supplied. Unlike isAdmin this is
 * never true in an open dev setup — used to mark parent chats so they don't
 * update the memory file (dev chats still should).
 */
export function usedAdminCode(request: NextRequest): boolean {
  return Boolean(config.adminCode) && matches(givenCode(request), config.adminCode);
}
