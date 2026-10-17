/**
 * Does an uploaded file look like it belongs to the reconciliation's period?
 * Older invoices are normal (late filing by suppliers, late booking), so only
 * two patterns are reported, as warnings — the import is never blocked:
 *  - most dated invoices fall outside the period (probably the wrong file), or
 *  - some invoices are dated after the period ends (unusual for that return).
 */

import { formatPeriod } from "./periods";

export function periodWarning(dates: (string | null)[], period: string): string | null {
  const dated = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dated.length) return null;
  const outside = dated.filter((d) => d.slice(0, 7) !== period);
  const later = outside.filter((d) => d.slice(0, 7) > period);

  if (outside.length * 2 > dated.length) {
    const counts = new Map<string, number>();
    for (const d of outside) counts.set(d.slice(0, 7), (counts.get(d.slice(0, 7)) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `${outside.length} of ${dated.length} invoices are dated outside ${formatPeriod(period)} (most are from ${formatPeriod(top[0])}). Check that this is the right period's file.`;
  }
  if (later.length) {
    return `${later.length} invoice${later.length === 1 ? " is" : "s are"} dated after ${formatPeriod(period)}, which is unusual for this period. Check the dates in the file.`;
  }
  return null;
}
