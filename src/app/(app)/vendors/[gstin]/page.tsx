import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleAlert, CircleCheck, Mail } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/recon/money";
import { formatPeriod } from "@/lib/recon/periods";
import { CATEGORY_INFO, isCategory } from "@/lib/recon/labels";
import { followUpCandidates, loadVendorRecords, type VendorRecord } from "@/lib/vendors/load";
import { computeVendorStats } from "@/lib/vendors/stats";
import { draftSupplierEmail } from "@/lib/vendors/email";
import { saveFollowUp, updateFollowUpStatus } from "@/lib/vendors/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../../reconciliation/[id]/submit-button";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Vendor" };

type Props = {
  params: Promise<{ gstin: string }>;
  searchParams: Promise<{ saved?: string; updated?: string; error?: string }>;
};

const FOLLOWUP_LABEL = { DRAFT: "Draft — not sent", SENT: "Sent (outside Taxora)", RESOLVED: "Resolved" } as const;

export default async function VendorPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const gstin = decodeURIComponent((await params).gstin).toUpperCase();
  const sp = await searchParams;
  if (!/^[0-9A-Z]{15}$/.test(gstin)) notFound();

  const records = await loadVendorRecords(session, { supplierGstin: gstin });
  if (records.length === 0) notFound();
  const [stats] = computeVendorStats(records);
  const candidates = followUpCandidates(records);

  const followUps = await db.followUp.findMany({
    where: { firmId: session.firm.id, supplierGstin: gstin },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, clientId: true, periodLabel: true, subject: true, status: true, note: true, matchResultIds: true, createdAt: true, updatedAt: true },
  });

  // One draft per client and tax period — even if that period was reconciled
  // more than once — built from the real invoices. An invoice that appears in
  // several runs is listed once, from the most recent run.
  const groups = new Map<string, VendorRecord[]>();
  for (const c of candidates) {
    const key = `${c.clientId}|${c.period}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const latest = new Map<string, VendorRecord>();
    for (const r of [...list].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())) {
      const k = `${r.invoiceNo.toUpperCase().replace(/[^A-Z0-9]/g, "")}|${r.invoiceDate ?? ""}`;
      if (!latest.has(k)) latest.set(k, r);
    }
    groups.set(key, [...latest.values()].sort((a, b) => (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? "")));
  }
  const drafts = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([groupKey, items]) => {
    const first = items[0];
    const periodLabel = formatPeriod(first.period);
    const draft = draftSupplierEmail({
      supplierName: stats.supplierName,
      supplierGstin: gstin,
      buyerName: first.clientName,
      buyerGstin: first.clientGstin,
      periodLabel,
      senderName: session.user.name,
      items: items.map((i) => ({
        invoiceNo: i.invoiceNo,
        invoiceDate: i.invoiceDate,
        taxable: i.taxable,
        tax: i.tax,
        issue: i.category === "MISSING_IN_2B" ? ("MISSING_IN_2B" as const) : ("VALUE_DIFF" as const),
        gstr2bTax: i.gstr2bTax,
      })),
    });
    const alreadyDrafted = followUps.some((f) => items.every((i) => f.matchResultIds.includes(i.resultId)));
    return { key: groupKey.replace(/[^A-Za-z0-9-]/g, "-"), clientId: first.clientId, clientName: first.clientName, periodLabel, items, draft, alreadyDrafted };
  });

  return (
    <div className="space-y-6">
      <Link href="/vendors" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Vendors
      </Link>
      {sp.saved === "1" && <Note tone="ok">Draft saved to the follow-up log. Nothing has been sent.</Note>}
      {sp.updated === "1" && <Note tone="ok">Follow-up status updated.</Note>}
      {sp.error && <Note tone="error">{sp.error}</Note>}

      <PageHeader title={stats.supplierName ?? "Supplier"} description={`GSTIN ${gstin} · ${stats.clients} client(s)`} />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Matching rate" value={stats.matchRate === null ? "—" : `${stats.matchRate.toFixed(1)}%`} sub={`${stats.matched} of ${stats.eligible} eligible invoices`} />
        <Card label="Not in GSTR-2B" value={String(stats.missingIn2b)} sub={stats.periodsWithMissing > 1 ? `across ${stats.periodsWithMissing} periods` : "invoices"} warn={stats.missingIn2b > 0} />
        <Card label="Outstanding" value={String(stats.outstanding)} sub="pending decisions" warn={stats.outstanding > 0} />
        <Card label="Last reconciled" value={formatDateTime(stats.lastReconciledAt)} sub={`${formatPeriod(stats.firstPeriod)} – ${formatPeriod(stats.lastPeriod)}`} />
      </dl>

      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Items to raise with the supplier ({candidates.length})</h2>
        {candidates.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted">Nothing outstanding for this supplier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Client · period</th>
                  <th scope="col" className="px-4 py-2 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2 font-medium">Issue</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Tax (books) ₹</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Tax (2B) ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {candidates.map((c) => (
                  <tr key={c.resultId}>
                    <td className="px-4 py-2 text-slate-700">{c.clientName} · {formatPeriod(c.period)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/reconciliation/${c.reconciliationId}/results/${c.resultId}`} className="font-mono text-xs text-brand-600 hover:underline">{c.invoiceNo}</Link>
                      <p className="text-xs text-muted">{c.invoiceDate ?? "No date"}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{isCategory(c.category) ? CATEGORY_INFO[c.category].label : c.category}{c.category !== "MISSING_IN_2B" && " · tax differs"}</td>
                    <td className="tabular px-4 py-2 text-right">{formatPaise(c.tax)}</td>
                    <td className="tabular px-4 py-2 text-right">{c.gstr2bTax === null ? "—" : formatPaise(c.gstr2bTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drafts.map((d) => (
        <section key={d.key} className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Follow-up email · {d.clientName} · {d.periodLabel}
            </h2>
            {d.alreadyDrafted && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Already in the follow-up log</span>}
          </div>
          <p className="mt-1 text-xs text-muted">Built from the {d.items.length} invoice(s) above. Edit as needed, then copy it into your email. Taxora does not send emails.</p>
          <form action={saveFollowUp} className="mt-4 space-y-3">
            <input type="hidden" name="supplierGstin" value={gstin} />
            <input type="hidden" name="clientId" value={d.clientId} />
            <input type="hidden" name="periodLabel" value={d.periodLabel} />
            <input type="hidden" name="resultIds" value={d.items.map((i) => i.resultId).join(",")} />
            <div>
              <label htmlFor={`subject-${d.key}`} className="block text-xs font-medium text-slate-700">Subject</label>
              <input id={`subject-${d.key}`} name="subject" defaultValue={d.draft.subject} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor={`body-${d.key}`} className="block text-xs font-medium text-slate-700">Message</label>
              <textarea id={`body-${d.key}`} name="body" rows={14} defaultValue={d.draft.body} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 font-mono text-xs leading-relaxed" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton subjectId={`subject-${d.key}`} bodyId={`body-${d.key}`} />
              <SubmitButton pendingText="Saving…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
                Save to follow-up log
              </SubmitButton>
            </div>
          </form>
        </section>
      ))}

      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Follow-up log</h2>
        {followUps.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted">No follow-ups saved yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {followUps.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{f.subject}</p>
                  <p className="text-xs text-muted">
                    {f.periodLabel} · {f.matchResultIds.length} invoice(s) · saved {formatDateTime(f.createdAt)}
                    {f.status !== "DRAFT" && ` · updated ${formatDateTime(f.updatedAt)}`}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${f.status === "RESOLVED" ? "text-emerald-700" : f.status === "SENT" ? "text-sky-700" : "text-slate-600"}`}>
                    {FOLLOWUP_LABEL[f.status]}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {f.status === "DRAFT" && <StatusButton id={f.id} status="SENT" label="I've sent it" />}
                  {f.status !== "RESOLVED" && <StatusButton id={f.id} status="RESOLVED" label="Mark resolved" />}
                  {f.status !== "DRAFT" && <StatusButton id={f.id} status="DRAFT" label="Reopen" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={updateFollowUpStatus}>
      <input type="hidden" name="followUpId" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton pendingText="…" className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface disabled:opacity-60">
        {label}
      </SubmitButton>
    </form>
  );
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular mt-1 text-xl font-semibold ${warn ? "text-rose-700" : "text-ink"}`}>{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  );
}

function Note({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </div>
  );
}
