import type { Metadata } from "next";
import Link from "next/link";
import { Info, Truck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatPeriod } from "@/lib/recon/periods";
import { loadVendorRecords } from "@/lib/vendors/load";
import { computeVendorStats } from "@/lib/vendors/stats";
import { PageHeader, buttonPrimary } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Vendors" };

type Props = { searchParams: Promise<{ client?: string }> };

export default async function VendorsPage({ searchParams }: Props) {
  const session = await requireSession();
  const { client } = await searchParams;
  const clients = await db.client.findMany({
    where: { firmId: session.firm.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const clientId = clients.some((c) => c.id === client) ? client : undefined;
  const stats = computeVendorStats(await loadVendorRecords(session, { clientId }));

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor health" description="How well each supplier's invoices in the books match GSTR-2B, across completed reconciliations." />

      <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p>
            <strong>Matching rate</strong> = matched invoices ÷ eligible invoices. <em>Eligible</em>: purchase-register entries in
            completed reconciliations, excluding duplicate entries. <em>Matched</em>: exact matches, and fuzzy/probable/GSTIN matches not
            rejected by a reviewer.
          </p>
          <p className="mt-1">A low rate is a signal to investigate (for example late filing or data-entry differences) — not proof of misconduct or non-compliance.</p>
        </div>
      </div>

      <form className="flex items-center gap-2" action="/vendors">
        <label htmlFor="client" className="text-sm text-slate-600">Client</label>
        <select id="client" name="client" defaultValue={clientId ?? ""} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-surface">Apply</button>
      </form>

      {stats.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Truck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-ink">No vendor data yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600">Vendor health appears once a reconciliation has been run.</p>
          <Link href="/reconciliation" className={`${buttonPrimary} mt-6`}>Go to reconciliation</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Supplier</th>
                  <th scope="col" className="px-4 py-3 font-medium">Matching rate</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Sample</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Not in 2B</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-4 py-3 font-medium">Periods</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Last reconciled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.map((s) => {
                  const tone = s.matchRate === null ? "bg-slate-300" : s.matchRate >= 95 ? "bg-emerald-500" : s.matchRate >= 80 ? "bg-amber-500" : "bg-rose-500";
                  return (
                    <tr key={s.supplierGstin} className="hover:bg-surface">
                      <td className="px-4 py-3">
                        <Link href={`/vendors/${encodeURIComponent(s.supplierGstin)}`} className="font-medium text-ink hover:text-brand-600">
                          {s.supplierName ?? "Name not recorded"}
                        </Link>
                        <p className="font-mono text-xs text-muted">{s.supplierGstin}</p>
                      </td>
                      <td className="px-4 py-3">
                        {s.matchRate === null ? (
                          <span className="text-xs text-muted">No eligible invoices</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <div className={`h-full ${tone}`} style={{ width: `${s.matchRate}%` }} />
                            </div>
                            <span className="tabular font-medium text-ink">{s.matchRate.toFixed(1)}%</span>
                          </div>
                        )}
                        {s.matchedPendingReview > 0 && <p className="mt-0.5 text-xs text-amber-700">{s.matchedPendingReview} match(es) awaiting review</p>}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-slate-700">{s.matched}/{s.eligible}</td>
                      <td className={`tabular px-4 py-3 text-right ${s.missingIn2b ? "font-medium text-rose-700" : "text-slate-500"}`}>{s.missingIn2b}</td>
                      <td className={`tabular px-4 py-3 text-right ${s.outstanding ? "font-medium text-amber-700" : "text-slate-500"}`}>{s.outstanding}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {s.firstPeriod === s.lastPeriod ? formatPeriod(s.firstPeriod) : `${formatPeriod(s.firstPeriod)} – ${formatPeriod(s.lastPeriod)}`}
                        {s.periodsWithMissing > 1 && <p className="text-rose-700">Missing in {s.periodsWithMissing} periods</p>}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatDate(s.lastReconciledAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
