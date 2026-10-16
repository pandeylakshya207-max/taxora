import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader, buttonPrimary } from "@/components/app/page-header";
import { NewReconciliationForm } from "./new-form";

export const metadata: Metadata = { title: "New reconciliation" };

type Props = { searchParams: Promise<{ client?: string }> };

export default async function NewReconciliationPage({ searchParams }: Props) {
  const session = await requireSession();
  const { client } = await searchParams;
  const clients = await db.client.findMany({
    where: { firmId: session.firm.id, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, gstin: true },
  });

  return (
    <div className="space-y-6">
      <Link href="/reconciliation" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Reconciliation
      </Link>
      <PageHeader title="New reconciliation" description="Choose whose records you are reconciling, and for which month." />
      <div className="max-w-xl rounded-2xl border border-line bg-white p-6 sm:p-8">
        {clients.length === 0 ? (
          <div>
            <p className="text-sm text-slate-600">You need at least one active client first.</p>
            <Link href="/clients/new" className={`${buttonPrimary} mt-4`}>Add a client</Link>
          </div>
        ) : (
          <NewReconciliationForm
            clients={clients}
            defaultClientId={clients.some((c) => c.id === client) ? client : undefined}
          />
        )}
      </div>
    </div>
  );
}
