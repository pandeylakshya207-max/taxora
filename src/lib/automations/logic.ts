/**
 * Pure selection logic for each automation, kept free of database access so it
 * can be tested. Each candidate carries a dedupe key: an alert with the same key
 * is never raised twice for the same automation.
 */

import { daysBetweenIso } from "../compliance/dates";
import { periodMonthsBefore } from "./schedule";

export type Candidate = { key: string; title: string; href: string };

// ───────── Compliance due reminders ─────────

export type TaskLite = { id: string; title: string; dueDate: string; status: string };

export function complianceCandidates(tasks: TaskLite[], today: string, daysBefore: number): Candidate[] {
  const out: Candidate[] = [];
  for (const t of tasks) {
    if (t.status === "DONE" || t.status === "NOT_APPLICABLE") continue;
    const days = daysBetweenIso(today, t.dueDate);
    // Keyed by due date too, so a rescheduled task is reminded again.
    if (days < 0) out.push({ key: `task:${t.id}:${t.dueDate}:overdue`, title: `${t.title} — overdue since ${t.dueDate}`, href: "/compliance" });
    else if (days <= daysBefore)
      out.push({
        key: `task:${t.id}:${t.dueDate}:soon`,
        title: `${t.title} — ${days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`} (${t.dueDate})`,
        href: "/compliance",
      });
  }
  return out;
}

// ───────── Pending review reminders ─────────

export type ReconLite = { id: string; label: string; completedAt: Date; pending: number };

export function reviewCandidates(recons: ReconLite[], now: Date, staleDays: number): Candidate[] {
  const out: Candidate[] = [];
  for (const r of recons) {
    if (r.pending <= 0) continue;
    const waited = Math.floor((now.getTime() - r.completedAt.getTime()) / 86_400_000);
    if (waited < staleDays) continue;
    // One reminder per reconciliation per week of waiting.
    const week = Math.floor((waited - staleDays) / 7);
    out.push({
      key: `recon:${r.id}:w${week}`,
      title: `${r.label} — ${r.pending} result${r.pending === 1 ? "" : "s"} awaiting review for ${waited} day${waited === 1 ? "" : "s"}`,
      href: `/reconciliation/${r.id}/results?review=pending`,
    });
  }
  return out;
}

// ───────── Repeated missing in GSTR-2B ─────────

export type MissingLite = { clientId: string; clientName: string; supplierGstin: string; supplierName: string | null; period: string };

export function repeatedMissingCandidates(
  entries: MissingLite[],
  today: string,
  minPeriods: number,
  lookbackMonths: number,
): Candidate[] {
  const from = periodMonthsBefore(today, lookbackMonths - 1);
  const groups = new Map<string, { e: MissingLite; periods: Set<string> }>();
  for (const e of entries) {
    if (e.period < from) continue;
    const k = `${e.clientId}|${e.supplierGstin}`;
    const g = groups.get(k) ?? { e, periods: new Set<string>() };
    g.periods.add(e.period);
    if (e.supplierName && !g.e.supplierName) g.e = e;
    groups.set(k, g);
  }
  const out: Candidate[] = [];
  for (const { e, periods } of groups.values()) {
    if (periods.size < minPeriods) continue;
    const sorted = [...periods].sort();
    // Keyed by the latest period: a new period with the same pattern raises a new alert.
    out.push({
      key: `supplier:${e.clientId}:${e.supplierGstin}:${sorted[sorted.length - 1]}`,
      title: `${e.supplierName ?? e.supplierGstin} (${e.clientName}) — missing in GSTR-2B in ${periods.size} periods: ${sorted.join(", ")}`,
      href: `/vendors/${e.supplierGstin}`,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
