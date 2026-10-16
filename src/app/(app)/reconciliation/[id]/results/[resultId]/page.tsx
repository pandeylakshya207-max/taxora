import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleAlert, CircleCheck, Info } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { describeAction, formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/recon/money";
import { normalizeInvoiceNo } from "@/lib/recon/normalize";
import { DEFAULT_CONFIG, type AmountDiffs, type ReconConfig, type ScoreBreakdown } from "@/lib/recon/engine";
import { CATEGORY_INFO, FLAG_LABEL, REVIEW_LABEL, isCategory } from "@/lib/recon/labels";
import { FIELD_LABELS, type Field } from "@/lib/recon/import";
import { reviewResult } from "@/lib/recon/run-actions";
import { SubmitButton } from "../../submit-button";

export const metadata: Metadata = { title: "Invoice detail" };

type Props = {
  params: Promise<{ id: string; resultId: string }>;
  searchParams: Promise<{ back?: string; saved?: string; error?: string }>;
};

const AMOUNTS = ["taxable", "igst", "cgst", "sgst", "cess"] as const;
const AMOUNT_LABEL: Record<(typeof AMOUNTS)[number], string> = {
  taxable: "Taxable value",
  igst: "IGST",
  cgst: "CGST",
  sgst: "SGST / UTGST",
  cess: "Cess",
};

export default async function ResultDetailPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id, resultId } = await params;
  const sp = await searchParams;
  const back = sp.back?.startsWith(`/reconciliation/${id}/results`) ? sp.back : `/reconciliation/${id}/results`;

  const result = await db.matchResult.findFirst({
    where: { id: resultId, reconciliationId: id, firmId: session.firm.id },
    select: {
      id: true,
      category: true,
      prRowId: true,
      b2bRowId: true,
      flags: true,
      reasons: true,
      needsReview: true,
      score: true,
      diffs: true,
      relatedIds: true,
      reviewStatus: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedById: true,
      reconciliation: { select: { config: true, finalizedAt: true } },
    },
  });
  if (!result) notFound();

  const rowIds = [result.prRowId, result.b2bRowId, ...result.relatedIds].filter((x): x is string => !!x);
  const [rows, history, reviewer] = await Promise.all([
    db.invoiceRow.findMany({
      where: { id: { in: rowIds }, firmId: session.firm.id },
      select: {
        id: true, source: true, sourceRow: true, gstin: true, supplierName: true, invoiceNo: true, invoiceDate: true,
        docType: true, taxable: true, igst: true, cgst: true, sgst: true, cess: true, original: true,
      },
    }),
    db.auditLog.findMany({
      where: { firmId: session.firm.id, entityType: "MatchResult", entityId: result.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true } } },
    }),
    result.reviewedById ? db.user.findUnique({ where: { id: result.reviewedById }, select: { name: true } }) : null,
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pr = result.prRowId ? byId.get(result.prRowId) : undefined;
  const b = result.b2bRowId ? byId.get(result.b2bRowId) : undefined;
  const related = result.relatedIds.map((rid) => byId.get(rid)).filter((r): r is NonNullable<typeof r> => !!r);

  const info = isCategory(result.category) ? CATEGORY_INFO[result.category] : null;
  const diffs = result.diffs as unknown as AmountDiffs | null;
  const score = result.score as unknown as ScoreBreakdown | null;
  const config = (result.reconciliation.config as unknown as ReconConfig | null) ?? DEFAULT_CONFIG;
  const tol = config.roundingTolerancePaise;
  const finalized = !!result.reconciliation.finalizedAt;
  const self = `/reconciliation/${id}/results/${result.id}?back=${encodeURIComponent(back)}`;

  return (
    <div className="space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Results
      </Link>

      {sp.saved === "1" && <Banner tone="success">Review saved.</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${info?.badge ?? ""}`}>{info?.label ?? result.category}</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">{(pr ?? b)?.supplierName ?? (pr ?? b)?.gstin ?? "Invoice"}</h1>
          <p className="mt-1 text-sm text-slate-600">{info?.help}</p>
        </div>
        {score && (
          <div className="rounded-xl border border-line bg-white px-4 py-3 text-right">
            <p className="text-xs text-muted">Match score</p>
            <p className="tabular text-2xl font-semibold text-ink">{score.total.toFixed(1)}<span className="text-sm text-muted"> / 100</span></p>
          </div>
        )}
      </div>

      {/* Why */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold text-ink">Why this classification</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
          {result.reasons.map((r, i) => (
            <li key={i} className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{r}</li>
          ))}
        </ul>
        {result.flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.flags.map((f) => (
              <span key={f} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">{FLAG_LABEL[f] ?? f}</span>
            ))}
          </div>
        )}
      </section>

      {/* Side by side */}
      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Field</th>
                <th scope="col" className="px-4 py-3 font-medium">Purchase register{pr && <span className="ml-1 normal-case tracking-normal">· row {pr.sourceRow}</span>}</th>
                <th scope="col" className="px-4 py-3 font-medium">GSTR-2B{b && <span className="ml-1 normal-case tracking-normal">· row {b.sourceRow}</span>}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Difference ₹ (PR − 2B)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <TextRow label="Supplier GSTIN" a={pr?.gstin} b={b?.gstin} mono differs={!!pr && !!b && pr.gstin !== b.gstin} />
              <TextRow label="Supplier name" a={pr?.supplierName} b={b?.supplierName} />
              <TextRow
                label="Invoice number"
                a={pr && `${pr.invoiceNo}  →  ${normalizeInvoiceNo(pr.invoiceNo)}`}
                b={b && `${b.invoiceNo}  →  ${normalizeInvoiceNo(b.invoiceNo)}`}
                mono
                differs={!!pr && !!b && normalizeInvoiceNo(pr.invoiceNo) !== normalizeInvoiceNo(b.invoiceNo)}
              />
              <TextRow label="Invoice date" a={pr?.invoiceDate} b={b?.invoiceDate} differs={!!pr && !!b && pr.invoiceDate !== b.invoiceDate} />
              <TextRow label="Document type" a={pr?.docType} b={b?.docType} />
              {AMOUNTS.map((k) => {
                const d = diffs?.[k] ?? null;
                return (
                  <tr key={k}>
                    <th scope="row" className="px-4 py-2.5 font-medium text-slate-600">{AMOUNT_LABEL[k]}</th>
                    <td className="tabular px-4 py-2.5">{pr ? formatPaise(Number(pr[k])) : "—"}</td>
                    <td className="tabular px-4 py-2.5">{b ? formatPaise(Number(b[k])) : "—"}</td>
                    <td className={`tabular px-4 py-2.5 text-right ${d !== null && Math.abs(d) > tol ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                      {d === null ? "—" : formatPaise(d)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-surface">
                <th scope="row" className="px-4 py-2.5 font-semibold text-ink">Total value</th>
                <td className="tabular px-4 py-2.5 font-semibold">{pr ? formatPaise(Number(pr.taxable + pr.igst + pr.cgst + pr.sgst + pr.cess)) : "—"}</td>
                <td className="tabular px-4 py-2.5 font-semibold">{b ? formatPaise(Number(b.taxable + b.igst + b.cgst + b.sgst + b.cess)) : "—"}</td>
                <td className={`tabular px-4 py-2.5 text-right font-semibold ${diffs && Math.abs(diffs.total) > tol ? "text-rose-700" : "text-slate-600"}`}>
                  {diffs ? formatPaise(diffs.total) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Invoice numbers show the original value → the normalised form used for matching. Rounding tolerance: ₹{(tol / 100).toFixed(2)} per amount.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {score && (
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold text-ink">How the score is calculated</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="pb-2 text-left font-medium">Component</th>
                  <th scope="col" className="pb-2 text-right font-medium">Similarity</th>
                  <th scope="col" className="pb-2 text-right font-medium">Weight</th>
                  <th scope="col" className="pb-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {(["gstin", "invoiceNo", "amount", "date"] as const).map((k) => (
                  <tr key={k}>
                    <td className="py-1.5 text-slate-700">{{ gstin: "GSTIN", invoiceNo: "Invoice number", amount: "Amount", date: "Date proximity" }[k]}</td>
                    <td className="py-1.5 text-right">{(score[k] * 100).toFixed(0)}%</td>
                    <td className="py-1.5 text-right">{config.weights[k]}</td>
                    <td className="py-1.5 text-right font-medium">{(score[k] * config.weights[k]).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              The score ranks candidates. It never overrides a conflicting amount: any difference above is flagged for review regardless of score.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">Review</h2>
          {!result.needsReview ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              Exact match — no review needed.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Status: <span className="font-medium">{REVIEW_LABEL[result.reviewStatus]}</span>
                {reviewer && result.reviewedAt && <span className="text-muted"> · {reviewer.name}, {formatDateTime(result.reviewedAt)}</span>}
              </p>
              {result.reviewNote && <p className="mt-1 rounded-lg bg-surface p-2 text-sm text-slate-700">“{result.reviewNote}”</p>}
              {finalized ? (
                <p className="mt-3 text-sm text-muted">This reconciliation is finalised, so reviews are locked.</p>
              ) : (
                <form action={reviewResult} className="mt-4 space-y-3">
                  <input type="hidden" name="resultId" value={result.id} />
                  <input type="hidden" name="back" value={self} />
                  <label htmlFor="note" className="block text-sm font-medium text-slate-700">
                    Note <span className="font-normal text-muted">(required to reject)</span>
                  </label>
                  <textarea
                    id="note"
                    name="note"
                    rows={3}
                    maxLength={1000}
                    defaultValue={result.reviewNote ?? ""}
                    className="block w-full rounded-lg border border-line px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    placeholder="e.g. Supplier confirmed both entries are the same bill."
                  />
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton
                      name="decision"
                      value="ACCEPTED"
                      pendingText="Saving…"
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {result.category.startsWith("MISSING") || result.category === "DUPLICATE" ? "Mark reviewed" : "Accept match"}
                    </SubmitButton>
                    {result.category !== "DUPLICATE" && !result.category.startsWith("MISSING") && (
                      <SubmitButton
                        name="decision"
                        value="REJECTED"
                        pendingText="Saving…"
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Reject match
                      </SubmitButton>
                    )}
                    {result.reviewStatus !== "PENDING" && (
                      <SubmitButton
                        name="decision"
                        value="PENDING"
                        pendingText="Saving…"
                        className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-line hover:bg-surface disabled:opacity-60"
                      >
                        Reset to pending
                      </SubmitButton>
                    )}
                  </div>
                </form>
              )}
              <p className="mt-3 text-xs text-muted">Reviewing never changes the imported data — only the review status, note, reviewer and time are recorded.</p>
            </>
          )}
        </section>
      </div>

      {related.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {result.category === "DUPLICATE" ? "Duplicates this entry" : "Possible counterparts (not paired automatically)"}
          </h2>
          <ul className="mt-3 divide-y divide-amber-200 text-sm">
            {related.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-muted">{r.source === "GSTR2B" ? "GSTR-2B" : "Purchase register"} row {r.sourceRow}: </span>
                  <span className="font-mono">{r.invoiceNo}</span> · {r.invoiceDate ?? "no date"}
                </span>
                <span className="tabular">₹{formatPaise(Number(r.taxable + r.igst + r.cgst + r.sgst + r.cess))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(pr || b) && (
        <details className="rounded-xl border border-line bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700">Original cell values as uploaded</summary>
          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
            {[pr, b].map((r, i) =>
              r ? (
                <div key={r.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{i === 0 ? "Purchase register" : "GSTR-2B"} · row {r.sourceRow}</p>
                  <dl className="mt-2 space-y-1 text-sm">
                    {Object.entries(r.original as Record<string, string>).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="text-muted">{FIELD_LABELS[k as Field] ?? k}</dt>
                        <dd className="text-right font-mono text-xs text-ink">{v || "(blank)"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null,
            )}
          </div>
        </details>
      )}

      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">History</h2>
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No review actions yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {history.map((h) => {
              const d = h.details as { from?: string; to?: string; note?: string | null } | null;
              return (
                <li key={h.id} className="px-5 py-3">
                  <p className="text-ink">
                    {describeAction(h.action)}
                    {d?.to && <span className="text-slate-600"> → {REVIEW_LABEL[d.to as keyof typeof REVIEW_LABEL] ?? d.to}</span>}
                  </p>
                  {d?.note && <p className="text-xs text-slate-600">“{d.note}”</p>}
                  <p className="text-xs text-muted">{h.actor?.name ?? "System"} · {formatDateTime(h.createdAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TextRow({ label, a, b, mono, differs }: { label: string; a?: string | null; b?: string | null; mono?: boolean; differs?: boolean }) {
  const cls = `${mono ? "font-mono text-xs" : ""} ${differs ? "font-semibold text-rose-700" : "text-ink"}`;
  return (
    <tr>
      <th scope="row" className="px-4 py-2.5 font-medium text-slate-600">{label}</th>
      <td className={`px-4 py-2.5 ${cls}`}>{a ?? "—"}</td>
      <td className={`px-4 py-2.5 ${cls}`}>{b ?? "—"}</td>
      <td className="px-4 py-2.5 text-right text-xs text-muted">{differs ? "Differs" : ""}</td>
    </tr>
  );
}

function Banner({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const cls = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
