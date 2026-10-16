/**
 * Scheduling maths. Run times are whole hours in Indian Standard Time
 * (UTC+05:30, no daylight saving), independent of the server's time zone.
 */

const IST_OFFSET_MIN = 330;
export const MAX_ATTEMPTS = 3;
/** A run still marked RUNNING after this long was interrupted (server restart, timeout). */
export const STALE_RUN_MS = 15 * 60_000;

/** The next time strictly after `now` when the IST clock reads hour:00. */
export function nextRunAfter(now: Date, hourIst: number): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const candidate = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hourIst, 0, 0) - IST_OFFSET_MIN * 60_000;
  return new Date(candidate > now.getTime() ? candidate : candidate + 86_400_000);
}

/** Delay before automatic retry number `attempt` (1-based failures so far): 15, 30 minutes. */
export function retryDelayMs(failuresSoFar: number): number {
  return 15 * 60_000 * Math.max(1, failuresSoFar);
}

/**
 * After a run: when should the automation run next?
 * Success, or a manual run -> the normal schedule.
 * A scheduled failure -> retry soon, up to MAX_ATTEMPTS in a row, then wait for the normal schedule.
 */
export function planNext(
  now: Date,
  hourIst: number,
  outcome: { ok: boolean; consecutiveFailures: number },
): { nextRunAt: Date; retrying: boolean } {
  const regular = nextRunAfter(now, hourIst);
  if (outcome.ok || outcome.consecutiveFailures >= MAX_ATTEMPTS) return { nextRunAt: regular, retrying: false };
  const retryAt = new Date(now.getTime() + retryDelayMs(outcome.consecutiveFailures));
  return retryAt < regular ? { nextRunAt: retryAt, retrying: true } : { nextRunAt: regular, retrying: false };
}

/** "YYYY-MM" that is `months` before the IST month of `today` (YYYY-MM-DD). */
export function periodMonthsBefore(today: string, months: number): string {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1 - months;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
