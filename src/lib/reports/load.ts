import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { AmountDiffs, ReconSummary, ScoreBreakdown } from "@/lib/recon/engine";
import { CATEGORY_INFO, isCategory } from "@/lib/recon/labels";
import { FIELD_LABELS, type Field, type RowIssue } from "@/lib/recon/import";
import { formatPeriod } from "@/lib/recon/periods";
import type { ImportIssue, ReportData, ReportSide } from "./types";

export type ReportFilter = { category?: string; pendingOnly?: boolean };

/**
 * Load report data for one reconciliation in the signed-in workspace.
 * Returns null if it does not exist in this workspace or has not been run.
 */
export async function loadReportData(session: SessionContext, reconciliationId: string, filter: ReportFilter): Promise<ReportData | null> {
  const recon = await db.reconciliation.findFirst({
    where: { id: reconciliationId, firmId: session.firm.id, status: "COMPLETED" },
    select: {
      id: true,
      period: true,
      summary: true,
      completedAt: true,
      finalizedAt: true,
      finalizedById: true,
      client: { select: { name: true, gstin: true } },
      files: { select: { source: true, errors: true, stats: true } },
    },
  });
  if (!recon) return null;

  const category = filter.category && isCategory(filter.category) ? filter.category : undefined;
  const where: Prisma.MatchResultWhereInput = {
    reconciliationId: recon.id,
    firmId: session.firm.id,
    ...(category && { category }),
    ...(filter.pendingOnly && { needsReview: true, reviewStatus: "PENDING" }),
  };

  const [results, rows, pendingReview, finalizer] = await Promise.all([
    db.matchResult.findMany({
      where,
      orderBy: [{ needsReview: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { category: true, prRowId: true, b2bRowId: true, flags: true, reasons: true, needsReview: true, reviewStatus: true, reviewNote: true, score: true, diffs: true },
    }),
    db.invoiceRow.findMany({
      where: { reconciliationId: recon.id, firmId: session.firm.id },
      select: { id: true, sourceRow: true, gstin: true, supplierName: true, invoiceNo: true, invoiceDate: true, docType: true, taxable: true, igst: true, cgst: true, sgst: true, cess: true },
    }),
    db.matchResult.count({ where: { reconciliationId: recon.id, firmId: session.firm.id, needsReview: true, reviewStatus: "PENDING" } }),
    recon.finalizedById ? db.user.findUnique({ where: { id: recon.finalizedById }, select: { name: true } }) : null,
  ]);

  const sides = new Map<string, ReportSide>(
    rows.map((r) => [
      r.id,
      {
        sourceRow: r.sourceRow,
        gstin: r.gstin,
        supplierName: r.supplierName,
        invoiceNo: r.invoiceNo,
        invoiceDate: r.invoiceDate,
        docType: r.docType,
        taxable: Number(r.taxable),
        igst: Number(r.igst),
        cgst: Number(r.cgst),
        sgst: Number(r.sgst),
        cess: Number(r.cess),
      },
    ]),
  );

  const summary = recon.summary as unknown as ReconSummary;
  const importIssues: ImportIssue[] = [];
  let importIssueTotal = 0;
  for (const f of recon.files) {
    const label = f.source === "GSTR2B" ? "GSTR-2B" : "Purchase register";
    const stats = f.stats as unknown as { withErrors?: number };
    importIssueTotal += stats.withErrors ?? 0;
    for (const e of f.errors as unknown as RowIssue[]) {
      importIssues.push({ source: label, row: e.row, field: e.field ? FIELD_LABELS[e.field as Field] : "", message: e.message, value: e.value });
    }
  }

  const filterParts = [category && CATEGORY_INFO[category].label, filter.pendingOnly && "pending review only"].filter(Boolean);

  return {
    workspaceName: session.firm.name,
    client: recon.client,
    period: recon.period,
    periodLabel: formatPeriod(recon.period),
    generatedAt: new Date(),
    generatedBy: session.user.name,
    completedAt: recon.completedAt,
    finalizedAt: recon.finalizedAt,
    finalizedBy: finalizer?.name ?? null,
    filterLabel: filterParts.length ? filterParts.join(", ") : null,
    counts: {
      prRecords: summary.prRecords,
      gstr2bRecords: summary.gstr2bRecords,
      byCategory: summary.byCategory,
      needsReview: summary.needsReview,
      pendingReview,
    },
    lines: results.map((r) => {
      const d = r.diffs as unknown as AmountDiffs | null;
      return {
        category: r.category,
        flags: r.flags,
        reason: r.reasons[0] ?? "",
        needsReview: r.needsReview,
        reviewStatus: r.reviewStatus,
        reviewNote: r.reviewNote,
        score: (r.score as unknown as ScoreBreakdown | null)?.total ?? null,
        pr: r.prRowId ? sides.get(r.prRowId) ?? null : null,
        b2b: r.b2bRowId ? sides.get(r.b2bRowId) ?? null : null,
        diffTotal: d?.total ?? null,
        diffTaxable: d?.taxable ?? null,
        diffTax: d ? d.igst + d.cgst + d.sgst + d.cess : null,
      };
    }),
    importIssues,
    importIssueTotal,
  };
}
