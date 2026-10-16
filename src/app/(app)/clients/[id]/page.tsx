import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, ChevronLeft, GitCompare } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { businessTypeLabel, describeAction, formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, buttonPrimary } from "@/components/app/page-header";
import { formatPeriod } from "@/lib/recon/periods";

export const metadata: Metadata = { title: "Client" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
};

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const { created } = await searchParams;

  // Scoped by firm: guessing or editing another firm's client ID returns 404, not their data.
  const client = await db.client.findFirst({
    where: { id, firmId: session.firm.id },
    include: { createdBy: { select: { name: true } } },
  });
  if (!client) notFound();

  const history = await db.auditLog.findMany({
    where: { firmId: session.firm.id, entityType: "Client", entityId: client.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { actor: { select: { name: true } } },
  });

  const runs = await db.reconciliation.findMany({
    where: { firmId: session.firm.id, clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, period: true, status: true },
  });

  const details: [string, React.ReactNode][] = [
    ["GSTIN", client.gstin ? <span className="font-mono">{client.gstin}</span> : "Unregistered"],
    ["State code", client.stateCode ?? "—"],
    ["Business type", businessTypeLabel(client.businessType)],
    ["Contact person", client.contactName ?? "—"],
    ["Email", client.email ?? "—"],
    ["Phone", client.phone ?? "—"],
    ["Added by", `${client.createdBy.name} · ${formatDate(client.createdAt)}`],
  ];

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Clients
      </Link>

      {created === "1" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
          Client saved.
        </div>
      )}

      <PageHeader
        title={client.name}
        description={client.status === "ARCHIVED" ? "Archived client" : "Active client"}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-white lg:col-span-2">
          <h2 className="border-b border-line px-5 py-4 font-semibold text-ink">Details</h2>
          <dl className="divide-y divide-line">
            {details.map(([label, value]) => (
              <div key={label} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="col-span-2 text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-5 py-4 font-semibold text-ink">History</h2>
          <ul className="divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <p className="text-ink">{describeAction(entry.action)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.actor?.name ?? "System"} · {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <GitCompare className="h-4 w-4 text-slate-500" aria-hidden="true" />
            GST reconciliations
          </h2>
          {client.status === "ACTIVE" && (
            <Link href={`/reconciliation/new?client=${client.id}`} className={buttonPrimary}>
              New reconciliation
            </Link>
          )}
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No reconciliations for this client yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/reconciliation/${r.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-surface">
                  <span className="font-medium text-ink">{formatPeriod(r.period)}</span>
                  <span className="text-xs text-muted">{r.status === "DRAFT" ? "Draft" : r.status === "COMPLETED" ? "Completed" : "Failed"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
