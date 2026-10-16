import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatPeriod } from "@/lib/recon/periods";
import { PageHeader, buttonPrimary, buttonSecondary } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requireSession();
  const runs = await db.reconciliation.findMany({
    where: { firmId: session.firm.id, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 100,
    select: { id: true, period: true, completedAt: true, finalizedAt: true, client: { select: { name: true, gstin: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every report is built from the live results at the moment you download it — never from stored copies."
      />
      {runs.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-ink">No reports yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600">Reports become available once a reconciliation has been run.</p>
          <Link href="/reconciliation" className={`${buttonPrimary} mt-6`}>Go to reconciliation</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/reconciliation/${r.id}/results`} className="font-medium text-ink hover:text-brand-600">
                    {r.client.name} · {formatPeriod(r.period)}
                  </Link>
                  <p className="text-xs text-muted">
                    {r.client.gstin ?? "Unregistered"} · run {r.completedAt ? formatDateTime(r.completedAt) : "—"}
                    {r.finalizedAt ? " · finalised" : " · not finalised"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href={`/api/reconciliations/${r.id}/export?format=xlsx`} className={buttonSecondary} download>
                    <FileDown className="h-4 w-4" aria-hidden="true" />
                    Excel
                  </a>
                  <a href={`/api/reconciliations/${r.id}/export?format=pdf`} className={buttonSecondary} download>
                    <FileDown className="h-4 w-4" aria-hidden="true" />
                    PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
