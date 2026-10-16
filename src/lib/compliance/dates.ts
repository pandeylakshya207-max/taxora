/**
 * Compliance date helpers. Dates are plain "YYYY-MM-DD" strings in Indian
 * Standard Time, so a due date never shifts because of a server's time zone.
 *
 * Taxora ships NO built-in statutory due dates. Every due date comes from a
 * rule or an entry the user made, with the source they recorded.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/**
 * Due date for a tax period under a monthly rule.
 * period "2026-04", monthOffset 1, day 20 -> "2026-05-20".
 * Days past the end of the month clamp to the last day (day 31 in June -> 30 June).
 */
export function dueDateFor(period: string, rule: { monthOffset: number; dayOfMonth: number }): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  if (rule.dayOfMonth < 1 || rule.dayOfMonth > 31) throw new Error("Day of month must be 1–31.");
  if (rule.monthOffset < 0 || rule.monthOffset > 24) throw new Error("Month offset must be 0–24.");
  const monthIndex = +m[2] - 1 + rule.monthOffset;
  const year = +m[1] + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(rule.dayOfMonth, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type Urgency = "OVERDUE" | "DUE_SOON" | "UPCOMING" | "CLOSED";

/** Where a task belongs on the board. Done / not-applicable tasks are closed regardless of date. */
export function urgencyOf(task: { dueDate: string; status: string }, today: string, soonDays = 7): Urgency {
  if (task.status === "DONE" || task.status === "NOT_APPLICABLE") return "CLOSED";
  const days = daysBetweenIso(today, task.dueDate);
  if (days < 0) return "OVERDUE";
  if (days <= soonDays) return "DUE_SOON";
  return "UPCOMING";
}

export function describeDue(dueDate: string, today: string): string {
  const d = daysBetweenIso(today, dueDate);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 1) return `Due in ${d} days`;
  if (d === -1) return "1 day overdue";
  return `${-d} days overdue`;
}
