import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileDown, Search, ShieldCheck } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/recon/money";
import { formatPeriod } from "@/lib/recon/periods";
import { CATEGORY_INFO, CATEGORY_ORDER, FLAG_LABEL, REVIEW_LABEL, isCategory } from "@/lib/recon/labels";
import type { AmountDiffs, ReconSummary } from "@/lib/recon/engine";
import { PageHeader, buttonPrimary, buttonSecondary } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Reconciliation results" };

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cat?: string; review?: string; q?: string; page?: string }>;
};

export default async function ResultsPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;

  const recon = await db.reconciliation.findFirst({
    where: { id, firmId: session.firm.id },
    select: {
      id: true,
      period: true,
      status: true,
      summary: true,
      completedAt: true,
      finalizedAt: true,
      client: { select: { name: true, gstin: true } },
    },
  });
  if (!recon) notFound();
  if (recon.status !== "COMPLETED") redirect(`/reconciliation/${id}`);

  const summary = recon.summary as unknown as ReconSummary;
  const cat = isCategory(sp.cat) ? sp.cat : undefined;
  const review = sp.review === "pending" ? "pending" : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Search matches invoice number, GSTIN or supplier name on either side.
  let rowIds: string[] | undefined;
  if (q) {
    const hits = await db.invoiceRow.findMany({
      where: {
        reconciliationId: id,
        firmId: session.firm.id,
        OR: [
          { invoiceNo: { contains: q, mode: "insensitive" } },
          { gstin: { contains: q.toUpperCase() } },
          { supplierName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 2000,
    });
    rowIds = hits.map((h) => h.id);
  }

  const where: Prisma.MatchResultWhereInput = {
    reconciliationId: id,
    firmId: session.firm.id,
    ...(cat && { category: cat }),
    ...(review && { reviewStatus: "PENDING", needsReview: true }),
    ...(rowIds && { OR: [{ prRowId: { in: rowIds } }, { b2bRowId: { in: rowIds } }] }),
  };

  const [total, results, pendingCount] = await Promise.all([
    db.matchResult.count({ where }),
    db.matchResult.findMany({
      where,
      orderBy: [{ needsReview: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, category: true, prRowId: true, b2bRowId: true, flags: true, diffs: true, reviewStatus: true, needsReview: true },
    }),
    db.matchResult.count({ where: { reconciliationId: id, firmId: session.firm.id, needsReview: true, reviewStatus: "PENDING" } }),
  ]);

  const ids = results.flatMap((r) => [r.prRowId, r.b2bRowId]).filter((x): x is string => !!x);
  const rows = await db.invoiceRow.findMany({
    where: { id: { in: ids }, firmId: session.firm.id },
    select: { id: true, gstin: true, supplierName: true, invoiceNo: true, invoiceDate: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { cat, review, q: q || undefined, page: undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/reconciliation/${id}/results${s ? `?${s}` : ""}`;
  };
  const back = link({ page: page > 1 ? String(page) : undefined });

  return (
    <div className="space-y-6">
      <Link href={`/reconciliation/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Files
      </Link>

      <PageHeader
        title={`Results · ${recon.client.name}`}
        description={`${formatPeriod(recon.period)} · ${summary.prRecords} purchase-register and ${summary.gstr2bRecords} GSTR-2B records`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {recon.finalizedAt && (
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                Finalised
              </span>
            )}
            {(["xlsx", "pdf"] as const).map((fmt) => {
              const p = new URLSearchParams({ format: fmt });
              if (cat) p.set("cat", cat);
              if (review) p.set("review", review);
              return (
                <a key={fmt} href={`/api/reconciliations/${id}/export?${p.toString()}`} className={buttonSecondary} download>
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  {fmt === "xlsx" ? "Excel" : "PDF"}
                  {(cat || review) && <span className="text-xs font-normal text-muted">(filtered)</span>}
                </a>
              );
            })}
            <Link href={`/reconciliation/${id}/finalise`} className={buttonPrimary}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {recon.finalizedAt ? "ITC review" : "ITC review & finalise"}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <SummaryCard href={link({ cat: undefined, review: undefined })} active={!cat && !review} label="All results" value={Object.values(summary.byCategory).reduce((a, n) => a + n, 0)} />
        {CATEGORY_ORDER.map((c) => (
          <SummaryCard key={c} href={link({ cat: c, review: undefined })} active={cat === c} label={CATEGORY_INFO[c].label} value={summary.byCategory[c]} />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action={`/reconciliation/${id}/results`} className="relative w-full sm:max-w-sm" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="q" className="sr-only">Search results</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Invoice number, GSTIN or supplier"
            className="block w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {cat && <input type="hidden" name="cat" value={cat} />}
          {review && <input type="hidden" name="review" value={review} />}
        </form>
        <Link
          href={link({ review: review ? undefined : "pending", cat: undefined })}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
            review ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-700 hover:bg-surface"
          }`}
        >
          Needs review
          <span className="tabular rounded bg-white px-1.5 text-xs ring-1 ring-line">{pendingCount}</span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {results.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No results match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                  <th scope="col" className="px-4 py-3 font-medium">Supplier</th>
                  <th scope="col" className="px-4 py-3 font-medium">Purchase register</th>
                  <th scope="col" className="px-4 py-3 font-medium">GSTR-2B</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Value diff ₹</th>
                  <th scope="col" className="px-4 py-3 font-medium">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r) => {
                  const pr = r.prRowId ? rowById.get(r.prRowId) : undefined;
                  const b = r.b2bRowId ? rowById.get(r.b2bRowId) : undefined;
                  const any = pr ?? b;
                  const info = isCategory(r.category) ? CATEGORY_INFO[r.category] : null;
                  const diff = (r.diffs as unknown as AmountDiffs | null)?.total ?? null;
                  return (
                    <tr key={r.id} className="align-top hover:bg-surface">
                      <td className="px-4 py-3">
                        <Link href={`/reconciliation/${id}/results/${r.id}?back=${encodeURIComponent(back)}`} className="group">
                          <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${info?.badge ?? ""}`}>
                            {info?.short ?? r.category}
                          </span>
                          <span className="ml-2 text-xs text-brand-600 group-hover:underline">Open</span>
                        </Link>
                        {r.flags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.flags.map((f) => (
                              <span key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{FLAG_LABEL[f] ?? f}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{pr?.supplierName ?? b?.supplierName ?? "—"}</p>
                        <p className="font-mono text-xs text-muted">{any?.gstin}</p>
                      </td>
                      <td className="px-4 py-3">{pr ? <InvoiceCell no={pr.invoiceNo} date={pr.invoiceDate} /> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">{b ? <InvoiceCell no={b.invoiceNo} date={b.invoiceDate} /> : <span className="text-muted">—</span>}</td>
                      <td className={`tabular px-4 py-3 text-right ${diff && Math.abs(diff) > 100 ? "font-medium text-rose-700" : "text-slate-600"}`}>
                        {diff === null ? "—" : formatPaise(diff)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.needsReview ? (
                          <span className={r.reviewStatus === "PENDING" ? "text-amber-700" : r.reviewStatus === "ACCEPTED" ? "text-emerald-700" : "text-rose-700"}>
                            {REVIEW_LABEL[r.reviewStatus]}
                          </span>
                        ) : (
                          <span className="text-muted">Not needed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p className="tabular">{total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</p>
        {pages > 1 && (
          <div className="flex gap-2">
            {page > 1 && <Link href={link({ page: String(page - 1) })} className={buttonSecondary}>Previous</Link>}
            {page < pages && <Link href={link({ page: String(page + 1) })} className={buttonSecondary}>Next</Link>}
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Matches are evidence for professional review, not a determination of input tax credit eligibility.
      </p>
    </div>
  );
}

function SummaryCard({ href, active, label, value }: { href: string; active: boolean; label: string; value: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-xl border p-3 transition-colors ${active ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:bg-surface"}`}
    >
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-ink">{value.toLocaleString("en-IN")}</p>
    </Link>
  );
}

function InvoiceCell({ no, date }: { no: string; date: string | null }) {
  return (
    <>
      <p className="font-mono text-xs text-ink">{no}</p>
      <p className="text-xs text-muted">{date ?? "No date"}</p>
    </>
  );
}
