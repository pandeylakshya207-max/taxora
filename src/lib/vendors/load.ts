import "server-only";
import { db } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { VendorEntry } from "./stats";

export type VendorRecord = VendorEntry & {
  resultId: string;
  reconciliationId: string;
  clientName: string;
  clientGstin: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  taxable: number;
  tax: number;
  flags: string[];
  gstr2bTax: number | null;
};

const CHUNK = 5000;

/**
 * Purchase-register entries with their reconciliation outcome, for completed
 * reconciliations in this workspace only. Optionally narrowed to one client
 * and/or one supplier GSTIN.
 */
export async function loadVendorRecords(
  session: SessionContext,
  filter: { clientId?: string; supplierGstin?: string },
): Promise<VendorRecord[]> {
  const rows = await db.invoiceRow.findMany({
    where: {
      firmId: session.firm.id,
      source: "PURCHASE_REGISTER",
      ...(filter.supplierGstin && { gstin: filter.supplierGstin }),
      reconciliation: { status: "COMPLETED", ...(filter.clientId && { clientId: filter.clientId }) },
    },
    select: {
      id: true,
      gstin: true,
      supplierName: true,
      invoiceNo: true,
      invoiceDate: true,
      taxable: true,
      igst: true,
      cgst: true,
      sgst: true,
      cess: true,
      reconciliation: {
        select: { id: true, clientId: true, period: true, completedAt: true, client: { select: { name: true, gstin: true } } },
      },
    },
    take: 100_000,
  });
  if (!rows.length) return [];

  const results = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    results.push(
      ...(await db.matchResult.findMany({
        where: { firmId: session.firm.id, prRowId: { in: rows.slice(i, i + CHUNK).map((r) => r.id) } },
        select: { id: true, prRowId: true, b2bRowId: true, category: true, reviewStatus: true, needsReview: true, flags: true },
      })),
    );
  }
  const byPr = new Map(results.map((r) => [r.prRowId!, r]));

  const b2bIds = results.map((r) => r.b2bRowId).filter((x): x is string => !!x);
  const b2bTax = new Map<string, number>();
  for (let i = 0; i < b2bIds.length; i += CHUNK) {
    const b = await db.invoiceRow.findMany({
      where: { firmId: session.firm.id, id: { in: b2bIds.slice(i, i + CHUNK) } },
      select: { id: true, igst: true, cgst: true, sgst: true, cess: true },
    });
    for (const r of b) b2bTax.set(r.id, Number(r.igst + r.cgst + r.sgst + r.cess));
  }

  const out: VendorRecord[] = [];
  for (const row of rows) {
    const res = byPr.get(row.id);
    if (!res || !row.reconciliation.completedAt) continue;
    out.push({
      supplierGstin: row.gstin,
      supplierName: row.supplierName,
      clientId: row.reconciliation.clientId,
      period: row.reconciliation.period,
      completedAt: row.reconciliation.completedAt,
      category: res.category,
      reviewStatus: res.reviewStatus,
      needsReview: res.needsReview,
      resultId: res.id,
      reconciliationId: row.reconciliation.id,
      clientName: row.reconciliation.client.name,
      clientGstin: row.reconciliation.client.gstin,
      invoiceNo: row.invoiceNo,
      invoiceDate: row.invoiceDate,
      taxable: Number(row.taxable),
      tax: Number(row.igst + row.cgst + row.sgst + row.cess),
      flags: res.flags,
      gstr2bTax: res.b2bRowId ? b2bTax.get(res.b2bRowId) ?? null : null,
    });
  }
  return out;
}

/** Items worth raising with the supplier: not in GSTR-2B, or tax differs on a match not rejected. */
export function followUpCandidates(records: VendorRecord[]) {
  return records.filter(
    (r) =>
      r.reviewStatus !== "REJECTED" &&
      (r.category === "MISSING_IN_2B" || r.flags.includes("TAX_DIFF") || r.flags.includes("TAX_TYPE_CONFLICT")),
  );
}
