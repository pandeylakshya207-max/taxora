import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, CircleAlert, CircleCheck, FileDown, Lock, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/recon/money";
import { CATEGORY_INFO, CATEGORY_ORDER } from "@/lib/recon/labels";
import { loadReportData } from "@/lib/reports/load";
import { ITC_LABELS } from "@/lib/reports/itc";
import { finaliseReconciliation } from "@/lib/recon/finalise-actions";
import { PageHeader, buttonSecondary } from "@/components/app/page-header";
import { SubmitButton } from "../submit-button";

export const metadata: Metadata = { title: "ITC review & finalisation" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
};

const TONE = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  info: "text-sky-700",
} as const;

export default async function FinalisePage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;

  const recon = await db.reconciliation.findFirst({
    where: { id, firmId: session.firm.id },
    select: { id: true, status: true, finalizedAt: true, finalNote: true, finalizedById: true },
  });
  if (!recon) notFound();
  if (recon.status !== "COMPLETED") redirect(`/reconciliation/${id}`);

  const data = await loadReportData(session, id, {});
  if (!data || !data.itc) notFound();
  const itc = data.itc;

  const pendingByCategory = CATEGORY_ORDER.map((c) => ({
    category: c,
    count: data.lines.filter((l) => l.category === c && l.needsReview && l.reviewStatus === "PENDING").length,
  })).filter((x) => x.count > 0);
  const pending = data.counts.pendingReview;
  const canFinalise = session.role !== "MEMBER";
  const finaliser = recon.finalizedById
    ? await db.user.findUnique({ where: { id: recon.finalizedById }, select: { name: true } })
    : null;

  return (
    <div className="space-y-6">
      <Link href={`/reconciliation/${id}/results`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Results
      </Link>

      {sp.done === "1" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
          Reconciliation finalised. Reviews are now locked.
        </div>
      )}
      {sp.error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          {sp.error}
        </div>
      )}

      <PageHeader
        title="ITC review & finalisation"
        description={`${data.client.name} · ${data.periodLabel}`}
        actions={
          <a href={`/api/reconciliations/${id}/export?format=pdf`} className={buttonSecondary} download>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Review summary (PDF)
          </a>
        }
      />

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="font-semibold text-ink">Input tax credit comparison</h2>
          <p className="text-xs text-muted">Comparison figures for review — not a computation of eligible ITC.</p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-surface p-4">
            <dt className="text-xs text-muted">Tax as per purchase register</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-ink">₹{formatPaise(itc.booksTax)}</dd>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <dt className="text-xs text-muted">Tax as per GSTR-2B</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-ink">₹{formatPaise(itc.gstr2bTax)}</dd>
          </div>
        </dl>
        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="pb-2 font-medium">Bucket</th>
              <th scope="col" className="pb-2 text-right font-medium">Items</th>
              <th scope="col" className="pb-2 text-right font-medium">Tax ₹</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ITC_LABELS.map((item) => {
              const b = itc[item.key];
              return (
                <tr key={item.key}>
                  <td className="py-2.5">
                    <p className="font-medium text-ink">{item.label}</p>
                    <p className="text-xs text-muted">{item.help}</p>
                  </td>
                  <td className="tabular py-2.5 text-right text-slate-700">{b.count}</td>
                  <td className={`tabular py-2.5 text-right font-semibold ${b.tax !== 0 ? TONE[item.tone] : "text-slate-500"}`}>{formatPaise(b.tax)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-muted">
          Whether credit is available depends on the law and facts this comparison cannot see — for example blocked credits,
          time limits and payment to the supplier. Use these figures as evidence for your professional review.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="font-semibold text-ink">Unresolved items</h2>
        {pending === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Every result that needed review has a decision.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">{pending} result(s) still need a review decision before this can be finalised.</p>
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {pendingByCategory.map(({ category, count }) => (
                <li key={category}>
                  <Link
                    href={`/reconciliation/${id}/results?cat=${category}&review=pending`}
                    className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface"
                  >
                    <span className="text-ink">{CATEGORY_INFO[category].label}</span>
                    <span className="tabular font-medium text-amber-700">{count} pending →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Finalisation
        </h2>

        {recon.finalizedAt ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Finalised by {finaliser?.name ?? "a workspace admin"} on {formatDateTime(recon.finalizedAt)}
            </p>
            {recon.finalNote && <p className="mt-2">“{recon.finalNote}”</p>}
            <p className="mt-2 text-xs">Reviews are locked. To change anything, start a new reconciliation for this period.</p>
          </div>
        ) : !canFinalise ? (
          <p className="mt-2 text-sm text-slate-600">Only workspace owners and admins can finalise. Ask one of them to review and finalise this reconciliation.</p>
        ) : pending > 0 ? (
          <p className="mt-2 text-sm text-slate-600">Finalisation is available once every result above has a review decision.</p>
        ) : (
          <form action={finaliseReconciliation} className="mt-4 space-y-4">
            <input type="hidden" name="reconciliationId" value={id} />
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">What finalising does</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Locks every review decision on this reconciliation. They cannot be changed afterwards.</li>
                <li>Records your name, the time and your note in the audit trail and on every report.</li>
                <li>Does <strong>not</strong> change any imported figures, file a return, or contact the GST portal.</li>
                <li>Does <strong>not</strong> confirm that any credit is eligible.</li>
              </ul>
            </div>
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-slate-700">Finalisation note</label>
              <textarea
                id="note"
                name="note"
                rows={3}
                required
                minLength={10}
                maxLength={2000}
                placeholder="e.g. Reviewed with client on 17 Oct; supplier follow-ups sent for 3 invoices not in GSTR-2B."
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 rounded border-line" />
              I have reviewed the unresolved items and understand that finalising locks this reconciliation.
            </label>
            <SubmitButton
              pendingText="Finalising…"
              className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Finalise reconciliation
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
