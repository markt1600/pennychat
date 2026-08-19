// All user-facing dates in this app are Singapore time (where Penny lives).

const TZ = "Asia/Singapore";

/** Human date for prompts, e.g. "Tuesday, 19 August 2026". */
export function sgToday(): string {
  return new Date().toLocaleDateString("en-SG", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Sortable day key in Singapore time, e.g. "2026-08-19". */
export function sgDateKey(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
