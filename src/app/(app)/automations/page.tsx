import type { Metadata } from "next";
import { CircleAlert, CircleCheck, CircleDashed, Clock, Play, RotateCcw, TriangleAlert, Workflow } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { AUTOMATIONS, AUTOMATION_KINDS, RUN_HOURS, formatHour, resolveAutomationConfig, type AutomationKind } from "@/lib/automations/definitions";
import { MAX_ATTEMPTS } from "@/lib/automations/schedule";
import { runAutomationNow, saveAutomation } from "@/lib/automations/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Automations" };

type Props = { searchParams: Promise<{ kind?: string; saved?: string; ran?: string; error?: string }> };

const input = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm disabled:bg-surface disabled:text-muted";
const primary = "inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60";
const secondary = "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60";

const TRIGGER_LABEL = { SCHEDULE: "Scheduled", MANUAL: "Run now", RETRY: "Retry" } as const;
const STALE_TICK_MS = 2 * 60 * 60_000;

type RunResult = { checked?: number; newAlerts?: number; items?: string[] } | null;

export default async function AutomationsPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const canAdmin = session.role !== "MEMBER";

  const [stored, runs, lastTick] = await Promise.all([
    db.automation.findMany({ where: { firmId: session.firm.id } }),
    db.automationRun.findMany({
      where: { firmId: session.firm.id },
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { automation: { select: { kind: true } } },
    }),
    db.cronTick.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  const byKind = new Map(stored.map((a) => [a.kind as AutomationKind, a]));
  const runners = await db.user.findMany({
    where: { id: { in: [...new Set(runs.map((r) => r.triggeredById).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const runnerName = new Map(runners.map((u) => [u.id, u.name]));

  const cronConfigured = (process.env.CRON_SECRET ?? "").length >= 16;
  const now = Date.now();
  const tickStale = !lastTick || now - lastTick.startedAt.getTime() > STALE_TICK_MS;
  const anyEnabled = stored.some((a) => a.enabled);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations"
        description="Scheduled checks that create in-app notifications for your team. They read your data only — nothing is emailed, filed or changed."
      />

      {/* Scheduler status: shown honestly, because nothing runs unless the server is called on a schedule. */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Scheduler
        </h2>
        {!cronConfigured ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Not configured. Scheduled runs are unavailable until CRON_SECRET (at least 16 characters) is set on the server and a scheduler calls Taxora. “Run now” works either way.
          </p>
        ) : !lastTick ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Configured, but no scheduler call has been received yet, so automations will not run on their own.
          </p>
        ) : (
          <p className={`mt-2 flex items-start gap-2 text-sm ${tickStale ? "text-amber-800" : "text-emerald-700"}`}>
            {tickStale ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            Last scheduler call: {formatDateTime(lastTick.startedAt)}.
            {tickStale && " That was over two hours ago — check that the scheduler is still running."}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          An automation runs on the first scheduler call at or after its run time. Calling every 15 minutes keeps runs close to the time you choose.
          {anyEnabled ? "" : " No automation is switched on yet."}
        </p>
        <details className="mt-3 rounded-lg bg-surface p-3 text-xs text-slate-700">
          <summary className="cursor-pointer font-medium text-ink">How to connect a scheduler</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Set <code className="font-mono">CRON_SECRET</code> in the server environment to a long random value, then restart.</li>
            <li>
              Call <code className="font-mono">GET /api/cron/run</code> every 15 minutes with the header{" "}
              <code className="font-mono">Authorization: Bearer &lt;CRON_SECRET&gt;</code>. On Vercel, a Cron Job sends this header automatically when CRON_SECRET is set
              (plan limits on how often crons may run apply). On Windows, Task Scheduler can run{" "}
              <code className="font-mono">Invoke-RestMethod</code> against the same address.
            </li>
            <li>This page shows the time of the last call, so you can confirm it is working.</li>
          </ol>
        </details>
      </section>

      {AUTOMATION_KINDS.map((kind) => {
        const def = AUTOMATIONS[kind];
        const a = byKind.get(kind);
        const config = resolveAutomationConfig(kind, a?.config);
        const hour = a?.runHour ?? def.defaultHour;
        const mine = sp.kind === kind;
        return (
          <section key={kind} id={kind} className="scroll-mt-20 rounded-xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-ink">
                  <Workflow className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  {def.name}
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${a?.enabled ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20" : "bg-slate-50 text-slate-600 ring-slate-500/20"}`}>
                    {a?.enabled ? "On" : "Off"}
                  </span>
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">{def.description}</p>
              </div>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Schedule</dt>
                <dd className="text-ink">Daily at {formatHour(hour)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Next run</dt>
                <dd className="text-ink">
                  {a?.enabled && a.nextRunAt ? (cronConfigured ? formatDateTime(a.nextRunAt) : `${formatDateTime(a.nextRunAt)} (needs the scheduler)`) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last run</dt>
                <dd className="flex items-center gap-1.5 text-ink">
                  {a?.lastRunAt ? (
                    <>
                      {a.lastStatus === "FAILED" ? <CircleAlert className="h-4 w-4 text-rose-600" aria-hidden="true" /> : <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                      {a.lastStatus === "FAILED" ? "Failed" : "Succeeded"} · {formatDateTime(a.lastRunAt)}
                    </>
                  ) : (
                    <><CircleDashed className="h-4 w-4 text-slate-400" aria-hidden="true" />Never run</>
                  )}
                </dd>
              </div>
            </dl>
            {a && a.consecutiveFailures > 0 && (
              <p className="mt-2 text-xs text-rose-700">
                {a.consecutiveFailures} failed scheduled run{a.consecutiveFailures === 1 ? "" : "s"} in a row.
                {a.consecutiveFailures < MAX_ATTEMPTS ? " It will be retried automatically." : ` Automatic retries stop after ${MAX_ATTEMPTS}; it will try again at the next scheduled time.`}
              </p>
            )}

            {mine && sp.error && (
              <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"><CircleAlert className="h-4 w-4" aria-hidden="true" />{sp.error}</p>
            )}
            {mine && sp.saved && (
              <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CircleCheck className="h-4 w-4" aria-hidden="true" />Saved.</p>
            )}
            {mine && sp.ran && (
              <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CircleCheck className="h-4 w-4" aria-hidden="true" />Run finished. The result is in the history below.</p>
            )}

            <form action={saveAutomation} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="kind" value={kind} />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">
                <input type="checkbox" name="enabled" defaultChecked={a?.enabled ?? false} disabled={!canAdmin} className="h-4 w-4" />
                Run this automation on schedule
              </label>
              <label className="text-xs font-medium text-slate-700">
                Run time
                <select name="runHour" defaultValue={hour} disabled={!canAdmin} className={input}>
                  {RUN_HOURS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                </select>
              </label>
              {def.fields.map((f) => (
                <label key={f.key} className="text-xs font-medium text-slate-700">
                  {f.label}
                  <input type="number" name={f.key} defaultValue={config[f.key]} min={f.min} max={f.max} step={1} required disabled={!canAdmin} className={input} />
                  <span className="mt-0.5 block font-normal text-muted">{f.help}</span>
                </label>
              ))}
              {canAdmin && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <SubmitButton pendingText="Saving…" className={primary}>Save</SubmitButton>
                </div>
              )}
            </form>
            {canAdmin ? (
              <form action={runAutomationNow} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="kind" value={kind} />
                <SubmitButton name="retry" value="0" pendingText="Running…" className={secondary}>
                  <Play className="h-4 w-4" aria-hidden="true" />Run now
                </SubmitButton>
                {a?.lastStatus === "FAILED" && (
                  <SubmitButton name="retry" value="1" pendingText="Retrying…" className={secondary}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />Retry failed run
                  </SubmitButton>
                )}
                <p className="w-full text-xs text-muted">Run now uses the saved settings and does not change the schedule. Items already alerted are not alerted again.</p>
              </form>
            ) : (
              <p className="mt-3 text-xs text-muted">Only owners and admins can change or run automations.</p>
            )}
          </section>
        );
      })}

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Run history</h2>
        {runs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Started (IST)</th>
                  <th scope="col" className="px-4 py-3 font-medium">Automation</th>
                  <th scope="col" className="px-4 py-3 font-medium">Trigger</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const res = r.result as RunResult;
                  const seconds = r.finishedAt ? ((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1) : null;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDateTime(r.startedAt)}</td>
                      <td className="px-4 py-2.5 text-ink">{AUTOMATIONS[r.automation.kind as AutomationKind].name}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {TRIGGER_LABEL[r.trigger]}
                        {r.attempt > 1 && <span className="text-muted"> · attempt {r.attempt}</span>}
                        {r.triggeredById && <span className="block text-xs text-muted">{runnerName.get(r.triggeredById) ?? "A member"}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={r.status === "SUCCEEDED" ? "text-emerald-700" : r.status === "FAILED" ? "font-medium text-rose-700" : "text-slate-600"}>
                          {r.status === "SUCCEEDED" ? "Succeeded" : r.status === "FAILED" ? "Failed" : "Running"}
                        </span>
                        {seconds && <span className="block text-xs text-muted">{seconds}s</span>}
                      </td>
                      <td className="max-w-md px-4 py-2.5 text-xs text-slate-700">
                        {r.error && <p className="text-rose-700">{r.error}</p>}
                        {res && (
                          <>
                            <p>
                              Checked {res.checked ?? 0} · {res.newAlerts ? `${res.newAlerts} new alert${res.newAlerts === 1 ? "" : "s"}` : "nothing new to alert"}
                            </p>
                            {res.items && res.items.length > 0 && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-brand-600">Show items</summary>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4">{res.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
                              </details>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
