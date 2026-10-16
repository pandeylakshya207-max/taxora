import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, CircleAlert, CircleCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { createRule, setRuleActive } from "@/lib/compliance/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Due-date rules" };

type Props = { searchParams: Promise<{ error?: string; saved?: string }> };
const input = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export default async function RulesPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const rules = await db.dueDateRule.findMany({ where: { firmId: session.firm.id }, orderBy: [{ active: "desc" }, { label: "asc" }] });

  return (
    <div className="space-y-6">
      <Link href="/compliance" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Compliance
      </Link>
      {sp.error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />{sp.error}
        </div>
      )}
      {sp.saved === "1" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />Saved.
        </div>
      )}
      <PageHeader title="Due-date rules" description="Recurring monthly due dates your workspace uses. You supply the dates and their source; Taxora applies them." />

      <form action={createRule} className="grid gap-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-700 lg:col-span-1">
          Name
          <input name="label" required maxLength={80} placeholder="GSTR-3B (monthly)" className={input} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          Day of month
          <input name="dayOfMonth" type="number" min={1} max={31} required className={input} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          Which month
          <select name="monthOffset" defaultValue="1" className={input}>
            <option value="0">Same month as the period</option>
            <option value="1">Month after the period</option>
            <option value="2">2 months after</option>
            <option value="3">3 months after</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2 lg:col-span-1">
          Source of this date
          <input name="sourceNote" required maxLength={300} placeholder="e.g. CGST Rules / notification no. & date" className={input} />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <SubmitButton pendingText="Saving…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
            Add rule
          </SubmitButton>
          <p className="mt-2 text-xs text-muted">Days past the end of a month use the month&apos;s last day (e.g. day 31 in June becomes 30 June).</p>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {rules.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No rules yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`font-medium ${r.active ? "text-ink" : "text-muted line-through"}`}>{r.label}</p>
                  <p className="text-xs text-slate-600">
                    Day {r.dayOfMonth}, {r.monthOffset === 0 ? "same month" : `${r.monthOffset} month(s) after the period`} · source: {r.sourceNote}
                  </p>
                  <p className="text-[11px] text-muted">Added {formatDate(r.createdAt)}</p>
                </div>
                <form action={setRuleActive}>
                  <input type="hidden" name="ruleId" value={r.id} />
                  <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                  <SubmitButton pendingText="…" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-60">
                    {r.active ? "Disable" : "Enable"}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
