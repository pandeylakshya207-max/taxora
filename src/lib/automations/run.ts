import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { todayIst } from "@/lib/compliance/dates";
import { formatPeriod } from "@/lib/recon/periods";
import type { Automation, RunTrigger } from "@/generated/prisma/client";
import { AUTOMATIONS, resolveAutomationConfig } from "./definitions";
import { complianceCandidates, repeatedMissingCandidates, reviewCandidates, type Candidate } from "./logic";
import { MAX_ATTEMPTS, periodMonthsBefore, planNext } from "./schedule";

type RunResult = { checked: number; newAlerts: number; items: string[] };

const CHUNK = 5000;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A short, safe error message for the run history — never a stack trace. */
function errorText(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^P\d{4}$/.test(code)) return `Database error (${code}). The run can be retried.`;
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return "Unknown error.";
}

/**
 * Record the candidates not alerted before, and notify about them, in one
 * transaction: an alert is only remembered if its notification was saved.
 */
async function alertNew(automation: Automation, candidates: Candidate[], heading: (n: number) => string, href: string): Promise<RunResult> {
  if (!candidates.length) return { checked: 0, newAlerts: 0, items: [] };
  const fresh = await db.$transaction(async (tx) => {
    const created = await tx.automationAlert.createManyAndReturn({
      data: candidates.map((c) => ({ automationId: automation.id, dedupeKey: c.key })),
      skipDuplicates: true,
      select: { dedupeKey: true },
    });
    const keys = new Set(created.map((c) => c.dedupeKey));
    const items = candidates.filter((c) => keys.has(c.key));
    if (items.length) {
      const shown = items.slice(0, 5).map((c) => `• ${c.title}`);
      if (items.length > 5) shown.push(`…and ${items.length - 5} more.`);
      await notify(tx, {
        firmId: automation.firmId,
        kind: AUTOMATIONS[automation.kind].notificationKind,
        title: heading(items.length),
        body: shown.join("\n"),
        href: items.length === 1 ? items[0].href : href,
      });
    }
    return items;
  });
  return { checked: candidates.length, newAlerts: fresh.length, items: fresh.slice(0, 20).map((c) => c.title) };
}

const PERFORM: Record<Automation["kind"], (a: Automation, now: Date) => Promise<RunResult>> = {
  async COMPLIANCE_REMINDERS(a, now) {
    const { daysBefore } = resolveAutomationConfig(a.kind, a.config);
    const today = todayIst(now);
    const tasks = await db.complianceTask.findMany({
      where: { firmId: a.firmId, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { lte: addDaysIso(today, daysBefore) } },
      select: { id: true, title: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
      take: 2000,
    });
    const r = await alertNew(a, complianceCandidates(tasks, today, daysBefore), (n) => `${n} compliance task${n === 1 ? "" : "s"} due soon or overdue`, "/compliance");
    return { ...r, checked: tasks.length };
  },

  async REVIEW_PENDING(a, now) {
    const { staleDays } = resolveAutomationConfig(a.kind, a.config);
    const recons = await db.reconciliation.findMany({
      where: { firmId: a.firmId, status: "COMPLETED", finalizedAt: null, completedAt: { lte: new Date(now.getTime() - staleDays * 86_400_000) } },
      select: { id: true, period: true, completedAt: true, client: { select: { name: true } } },
      take: 500,
    });
    if (!recons.length) return { checked: 0, newAlerts: 0, items: [] };
    const counts = await db.matchResult.groupBy({
      by: ["reconciliationId"],
      where: { firmId: a.firmId, reconciliationId: { in: recons.map((r) => r.id) }, needsReview: true, reviewStatus: "PENDING" },
      _count: { _all: true },
    });
    const pending = new Map(counts.map((c) => [c.reconciliationId, c._count._all]));
    const lite = recons.map((r) => ({
      id: r.id,
      label: `${r.client.name} · ${formatPeriod(r.period)}`,
      completedAt: r.completedAt!,
      pending: pending.get(r.id) ?? 0,
    }));
    const r = await alertNew(a, reviewCandidates(lite, now, staleDays), (n) => `${n} reconciliation${n === 1 ? "" : "s"} still awaiting review`, "/reconciliation");
    return { ...r, checked: recons.length };
  },

  async REPEATED_MISSING(a, now) {
    const { minPeriods, lookbackMonths } = resolveAutomationConfig(a.kind, a.config);
    const today = todayIst(now);
    const results = await db.matchResult.findMany({
      where: {
        firmId: a.firmId,
        category: "MISSING_IN_2B",
        prRowId: { not: null },
        reconciliation: { status: "COMPLETED", period: { gte: periodMonthsBefore(today, lookbackMonths - 1) } },
      },
      select: { prRowId: true, reconciliation: { select: { clientId: true, period: true, client: { select: { name: true } } } } },
      take: 50_000,
    });
    const rows = new Map<string, { gstin: string; supplierName: string | null }>();
    const ids = results.map((r) => r.prRowId!);
    for (let i = 0; i < ids.length; i += CHUNK) {
      for (const row of await db.invoiceRow.findMany({
        where: { firmId: a.firmId, id: { in: ids.slice(i, i + CHUNK) } },
        select: { id: true, gstin: true, supplierName: true },
      })) rows.set(row.id, { gstin: row.gstin, supplierName: row.supplierName });
    }
    const entries = results.flatMap((r) => {
      const row = rows.get(r.prRowId!);
      return row
        ? [{ clientId: r.reconciliation.clientId, clientName: r.reconciliation.client.name, supplierGstin: row.gstin, supplierName: row.supplierName, period: r.reconciliation.period }]
        : [];
    });
    const r = await alertNew(
      a,
      repeatedMissingCandidates(entries, today, minPeriods, lookbackMonths),
      (n) => `${n} supplier${n === 1 ? "" : "s"} repeatedly missing in GSTR-2B`,
      "/vendors",
    );
    return { ...r, checked: results.length };
  },
};

/**
 * Run one automation and record the outcome. Never throws: failures are
 * stored on the run with a short error message.
 */
export async function executeAutomation(
  automationId: string,
  trigger: RunTrigger,
  opts: { triggeredById?: string } = {},
): Promise<{ ok: boolean; runId: string }> {
  const automation = await db.automation.findUniqueOrThrow({ where: { id: automationId } });
  // A run started by a person (run now / retry now) leaves the schedule and retry counter alone.
  const scheduled = !opts.triggeredById;
  const run = await db.automationRun.create({
    data: {
      firmId: automation.firmId,
      automationId,
      trigger,
      attempt: scheduled ? automation.consecutiveFailures + 1 : 1,
      triggeredById: opts.triggeredById ?? null,
    },
  });

  const startedAt = new Date();
  let result: RunResult | null = null;
  let error: string | null = null;
  try {
    result = await PERFORM[automation.kind](automation, startedAt);
  } catch (e) {
    console.error("[automation] run failed", { kind: automation.kind, runId: run.id });
    error = errorText(e);
  }
  const ok = error === null;
  const now = new Date();
  const failures = ok ? 0 : scheduled ? automation.consecutiveFailures + 1 : automation.consecutiveFailures;
  const plan = planNext(now, automation.runHour, { ok, consecutiveFailures: failures });

  await db.$transaction(async (tx) => {
    await tx.automationRun.update({
      where: { id: run.id },
      data: { status: ok ? "SUCCEEDED" : "FAILED", finishedAt: now, result: result ?? undefined, error },
    });
    await tx.automation.update({
      where: { id: automationId },
      data: {
        lastRunAt: now,
        lastStatus: ok ? "SUCCEEDED" : "FAILED",
        consecutiveFailures: failures,
        // A manual run leaves the schedule alone; a scheduled one moves it on (or to a retry).
        ...(scheduled && { nextRunAt: automation.enabled ? plan.nextRunAt : null }),
      },
    });
    // Tell owners and admins once automatic retries are used up.
    if (!ok && scheduled && !plan.retrying) {
      const admins = await tx.membership.findMany({ where: { firmId: automation.firmId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
      await notify(tx, {
        firmId: automation.firmId,
        kind: "automation.failed",
        title: `Automation failed: ${AUTOMATIONS[automation.kind].name}`,
        body: `${failures >= MAX_ATTEMPTS ? `Failed ${failures} times in a row. ` : ""}${error} It will run again at its next scheduled time; you can also retry it now.`,
        href: "/automations",
        userIds: admins.map((m) => m.userId),
      });
    }
  });
  return { ok, runId: run.id };
}
