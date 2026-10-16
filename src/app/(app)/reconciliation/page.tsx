import type { Metadata } from "next";
import Link from "next/link";
import { GitCompare, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatPeriod } from "@/lib/recon/periods";
import { PageHeader, buttonPrimary } from "@/components/app/page-header";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Reconciliation" };

export default async function ReconciliationListPage() {
  const session = await requireSession();
  const runs = await db.reconciliation.findMany({
    where: { firmId: session.firm.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      period: true,
      status: true,
      createdAt: true,
      client: { select: { name: true, gstin: true } },
      files: { select: { source: true, fileName: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST reconciliation"
        description="Purchase register against GSTR-2B, one client and tax period at a time."
        actions={
          <Link href="/reconciliation/new" className={buttonPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New reconciliation
          </Link>
        }
      />

      {runs.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <GitCompare className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-ink">No reconciliations yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600">
            Pick a client and a tax period, then upload their purchase register and GSTR-2B.
          </p>
          <Link href="/reconciliation/new" className={`${buttonPrimary} mt-6`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Start your first reconciliation
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Client</th>
                  <th scope="col" className="px-5 py-3 font-medium">Period</th>
                  <th scope="col" className="px-5 py-3 font-medium">Files</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="px-5 py-3">
                      <Link href={`/reconciliation/${r.id}`} className="font-medium text-ink hover:text-brand-600">
                        {r.client.name}
                      </Link>
                      {r.client.gstin && <p className="font-mono text-xs text-muted">{r.client.gstin}</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{formatPeriod(r.period)}</td>
                    <td className="px-5 py-3 text-slate-600">{r.files.length} of 2</td>
                    <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                    <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
