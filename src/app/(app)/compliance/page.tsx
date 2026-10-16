import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CircleAlert, CircleCheck, FileDown, Plus, Settings2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatPeriod } from "@/lib/recon/periods";
import { describeDue, todayIst, urgencyOf, type Urgency } from "@/lib/compliance/dates";
import { createTask, generateTasks, updateTask } from "@/lib/compliance/actions";
import { PageHeader, buttonSecondary } from "@/components/app/page-header";
import { SubmitButton } from "../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Compliance" };

type Props = { searchParams: Promise<{ client?: string; period?: string; show?: string; error?: string; saved?: string; generated?: string; skipped?: string }> };

const SECTIONS: { key: Urgency; title: string; tone: string }[] = [
  { key: "OVERDUE", title: "Overdue", tone: "text-rose-700" },
  { key: "DUE_SOON", title: "Due in the next 7 days", tone: "text-amber-700" },
  { key: "UPCOMING", title: "Upcoming", tone: "text-slate-700" },
  { key: "CLOSED", title: "Done / not applicable", tone: "text-emerald-700" },
];

const STATUS_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", NOT_APPLICABLE: "Not applicable" } as const;
const input = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export default async function CompliancePage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const today = todayIst();

  const [clients, rules] = await Promise.all([
    db.client.findMany({ where: { firmId: session.firm.id, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dueDateRule.findMany({ where: { firmId: session.firm.id, active: true }, orderBy: { label: "asc" }, select: { id: true, label: true, dayOfMonth: true, monthOffset: true } }),
  ]);
  const clientId = clients.some((c) => c.id === sp.client) ? sp.client : undefined;
  const period = sp.period && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period) ? sp.period : undefined;
  const showClosed = sp.show === "all";

  const where: Prisma.ComplianceTaskWhereInput = {
    firmId: session.firm.id,
    ...(clientId && { clientId }),
    ...(period && { period }),
    ...(!showClosed && { status: { in: ["TODO", "IN_PROGRESS"] } }),
  };
  const tasks = await db.complianceTask.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 500 });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const archivedIds = tasks.map((t) => t.clientId).filter((id): id is string => !!id && !clientName.has(id));
  if (archivedIds.length) {
    for (const c of await db.client.findMany({ where: { id: { in: archivedIds }, firmId: session.firm.id }, select: { id: true, name: true } })) {
      clientName.set(c.id, c.name);
    }
  }
  const grouped = new Map<Urgency, typeof tasks>();
  for (const t of tasks) {
    const u = urgencyOf(t, today);
    grouped.set(u, [...(grouped.get(u) ?? []), t]);
  }
  const qs = new URLSearchParams({ ...(clientId && { client: clientId }), ...(period && { period }), ...(showClosed && { show: "all" }) }).toString();
  const back = `/compliance${qs ? `?${qs}` : ""}`;

  return (
    <div className="space-y-6">
      {sp.error && <Banner tone="error">{sp.error}</Banner>}
      {sp.saved === "1" && <Banner tone="ok">Saved.</Banner>}
      {sp.generated !== undefined && (
        <Banner tone="ok">
          {sp.generated} task(s) created{sp.skipped && sp.skipped !== "0" ? `; ${sp.skipped} already existed and were left unchanged` : ""}.
        </Banner>
      )}

      <PageHeader
        title="Compliance"
        description="Filing and review tasks per client and tax period."
        actions={
          <>
            <a href={`/api/compliance/export${qs ? `?${qs}` : ""}`} className={buttonSecondary} download>
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Export
            </a>
            <Link href="/compliance/rules" className={buttonSecondary}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Due-date rules
            </Link>
          </>
        }
      />

      <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Taxora does not include official due dates, because they change by notification and extension. Every date here comes from a rule
        your workspace set up or an entry someone made — and shows its source. Check them against the official source before relying on them.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink">Create tasks from a rule</summary>
          {rules.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-sm text-slate-600">
              No active rules yet. <Link href="/compliance/rules" className="font-medium text-brand-600">Add a due-date rule</Link> first.
            </p>
          ) : clients.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-sm text-slate-600">Add a client first.</p>
          ) : (
            <form action={generateTasks} className="space-y-3 border-t border-line p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-700">
                  Rule
                  <select name="ruleId" required className={input}>
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>{r.label} (day {r.dayOfMonth}, +{r.monthOffset} month)</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Tax period
                  <input type="month" name="period" required className={input} />
                </label>
              </div>
              <fieldset>
                <legend className="text-xs font-medium text-slate-700">Clients</legend>
                <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-lg border border-line p-2">
                  {clients.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="clientIds" value={c.id} defaultChecked className="h-4 w-4" />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton pendingText="Creating…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
                Create tasks
              </SubmitButton>
              <p className="text-xs text-muted">Running this twice for the same rule, client and period does not create duplicates.</p>
            </form>
          )}
        </details>

        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink">
            <Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />
            Add a one-off task
          </summary>
          <form action={createTask} className="space-y-3 border-t border-line p-5">
            <label className="block text-xs font-medium text-slate-700">
              Title
              <input name="title" required maxLength={160} className={input} placeholder="e.g. Reply to notice for FY 2024-25" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-700">
                Client
                <select name="clientId" className={input} defaultValue="">
                  <option value="">None</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">
                Period
                <input type="month" name="period" className={input} />
              </label>
              <label className="text-xs font-medium text-slate-700">
                Due date
                <input type="date" name="dueDate" required className={input} />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-700">
              Source of the due date <span className="font-normal text-muted">(optional)</span>
              <input name="sourceNote" maxLength={300} className={input} placeholder="e.g. Notice dated 02-10-2026" />
            </label>
            <SubmitButton pendingText="Saving…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
              Add task
            </SubmitButton>
          </form>
        </details>
      </div>

      <form action="/compliance" className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          Client
          <select name="client" defaultValue={clientId ?? ""} className={input}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          Period
          <input type="month" name="period" defaultValue={period} className={input} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="show" value="all" defaultChecked={showClosed} className="h-4 w-4" />
          Include done
        </label>
        <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-surface">Apply</button>
      </form>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CalendarCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-ink">No open tasks</h2>
          <p className="mt-1 max-w-md text-sm text-slate-600">Set up due-date rules, then create tasks for your clients each period — or add a one-off task.</p>
        </div>
      ) : (
        SECTIONS.filter((s) => grouped.get(s.key)?.length).map((s) => (
          <section key={s.key} className="rounded-xl border border-line bg-white">
            <h2 className={`border-b border-line px-5 py-3 text-sm font-semibold ${s.tone}`}>
              {s.title} ({grouped.get(s.key)!.length})
            </h2>
            <ul className="divide-y divide-line">
              {grouped.get(s.key)!.map((t) => (
                <li key={t.id} className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t.title}</p>
                    <p className="text-xs text-slate-600">
                      {t.clientId ? clientName.get(t.clientId) ?? "Client" : "No client"}
                      {t.period && ` · ${formatPeriod(t.period)}`}
                      {" · "}
                      <span className={s.key === "OVERDUE" ? "font-medium text-rose-700" : ""}>
                        {t.dueDate.split("-").reverse().join("-")} — {s.key === "CLOSED" ? STATUS_LABEL[t.status] : describeDue(t.dueDate, today)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {t.dueDateSource === "RULE" ? "From your workspace rule" : "Entered manually"}
                      {t.sourceNote && ` · source: ${t.sourceNote}`}
                    </p>
                    {t.notes && <p className="mt-1 text-xs text-slate-700">“{t.notes}”</p>}
                    {t.reconciliationId && (
                      <Link href={`/reconciliation/${t.reconciliationId}`} className="text-xs text-brand-600 hover:underline">Open reconciliation</Link>
                    )}
                  </div>
                  <form action={updateTask} className="flex shrink-0 flex-wrap items-center gap-2">
                    <input type="hidden" name="taskId" value={t.id} />
                    <input type="hidden" name="back" value={back} />
                    <label className="sr-only" htmlFor={`status-${t.id}`}>Status</label>
                    <select id={`status-${t.id}`} name="status" defaultValue={t.status} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <label className="sr-only" htmlFor={`notes-${t.id}`}>Review note</label>
                    <input id={`notes-${t.id}`} name="notes" defaultValue={t.notes ?? ""} maxLength={2000} placeholder="Review note" className="w-44 rounded-lg border border-line px-2 py-1.5 text-sm" />
                    <SubmitButton pendingText="…" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-60">
                      Save
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </div>
  );
}
