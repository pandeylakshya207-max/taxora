import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { businessTypeLabel, formatDate } from "@/lib/format";
import { PageHeader, buttonPrimary, buttonSecondary } from "@/components/app/page-header";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Clients" };

const PAGE_SIZE = 25;

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

export default async function ClientsPage({ searchParams }: Props) {
  const session = await requireSession();
  const params = await searchParams;

  const q = (params.q ?? "").trim().slice(0, 100);
  const status = params.status === "archived" ? "ARCHIVED" : "ACTIVE";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  // firmId is always part of the filter: a firm can only ever list its own clients.
  const where: Prisma.ClientWhereInput = {
    firmId: session.firm.id,
    status,
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { gstin: { contains: q.toUpperCase().replace(/\s+/g, "") } },
        { contactName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [total, clients, firmTotal] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, gstin: true, businessType: true, contactName: true, createdAt: true },
    }),
    db.client.count({ where: { firmId: session.firm.id } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q: q || undefined, status: params.status, page: undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/clients?${s}` : "/clients";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every business you reconcile GST for."
        actions={
          <Link href="/clients/new" className={buttonPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add client
          </Link>
        }
      />

      {firmTotal === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-ink">No clients yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600">
            Add a client to start organising their GST reconciliations.
          </p>
          <Link href="/clients/new" className={`${buttonPrimary} mt-6`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add your first client
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form action="/clients" className="relative w-full sm:max-w-sm" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <label htmlFor="q" className="sr-only">Search clients</label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Search by name, GSTIN or contact"
                className="block w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              {params.status === "archived" && <input type="hidden" name="status" value="archived" />}
            </form>
            <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm" aria-label="Client status">
              <Link
                href={link({ status: undefined })}
                aria-current={status === "ACTIVE" ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium ${status === "ACTIVE" ? "bg-navy-900 text-white" : "text-slate-600 hover:text-ink"}`}
              >
                Active
              </Link>
              <Link
                href={link({ status: "archived" })}
                aria-current={status === "ARCHIVED" ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium ${status === "ARCHIVED" ? "bg-navy-900 text-white" : "text-slate-600 hover:text-ink"}`}
              >
                Archived
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {clients.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                {q ? `No ${status === "ARCHIVED" ? "archived" : "active"} clients match “${q}”.` : `No ${status === "ARCHIVED" ? "archived" : "active"} clients.`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Client</th>
                      <th scope="col" className="px-5 py-3 font-medium">GSTIN</th>
                      <th scope="col" className="hidden px-5 py-3 font-medium md:table-cell">Type</th>
                      <th scope="col" className="hidden px-5 py-3 font-medium md:table-cell">Contact</th>
                      <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {clients.map((c) => (
                      <tr key={c.id} className="hover:bg-surface">
                        <td className="px-5 py-3">
                          <Link href={`/clients/${c.id}`} className="font-medium text-ink hover:text-brand-600">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{c.gstin ?? <span className="font-sans text-muted">Unregistered</span>}</td>
                        <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{businessTypeLabel(c.businessType)}</td>
                        <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{c.contactName ?? "—"}</td>
                        <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{formatDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <p className="tabular">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              {pages > 1 && (
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link href={link({ page: String(page - 1) })} className={buttonSecondary}>Previous</Link>
                  )}
                  {page < pages && (
                    <Link href={link({ page: String(page + 1) })} className={buttonSecondary}>Next</Link>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
