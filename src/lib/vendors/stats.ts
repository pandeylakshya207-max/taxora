/**
 * Supplier (vendor) health, computed only from reconciliation results.
 *
 * MATCHING RATE = matched invoices ÷ eligible invoices × 100
 *   Eligible: purchase-register entries in completed reconciliations, excluding
 *             entries set aside as duplicates of another book entry.
 *   Matched:  eligible entries that were an exact match, or a fuzzy / probable /
 *             GSTIN-mismatch match that a reviewer did not reject.
 * Matches still awaiting review count as matched but are reported separately.
 *
 * A low rate is a signal to investigate — for example late filing by the
 * supplier, or data-entry differences in the books. It is not evidence of
 * misconduct or non-compliance.
 */

export type VendorEntry = {
  supplierGstin: string;
  supplierName: string | null;
  clientId: string;
  period: string; // YYYY-MM
  completedAt: Date;
  category: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  needsReview: boolean;
};

export type VendorStats = {
  supplierGstin: string;
  supplierName: string | null;
  eligible: number;
  matched: number;
  matchedPendingReview: number;
  /** null when there are no eligible invoices (rate undefined, not zero). */
  matchRate: number | null;
  missingIn2b: number;
  /** Pending review decisions plus unresolved "missing in GSTR-2B" items. */
  outstanding: number;
  /** Number of distinct periods with at least one invoice missing in GSTR-2B. */
  periodsWithMissing: number;
  firstPeriod: string;
  lastPeriod: string;
  lastReconciledAt: Date;
  clients: number;
};

const PAIR = new Set(["EXACT", "FUZZY", "PROBABLE", "GSTIN_MISMATCH"]);

export function computeVendorStats(entries: VendorEntry[]): VendorStats[] {
  const groups = new Map<string, VendorEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.supplierGstin) ?? [];
    list.push(e);
    groups.set(e.supplierGstin, list);
  }

  const out: VendorStats[] = [];
  for (const [gstin, list] of groups) {
    let eligible = 0;
    let matched = 0;
    let matchedPendingReview = 0;
    let missingIn2b = 0;
    let outstanding = 0;
    const missingPeriods = new Set<string>();
    const clients = new Set<string>();
    let name: string | null = null;
    let latest = list[0];

    for (const e of list) {
      clients.add(e.clientId);
      if (e.completedAt > latest.completedAt) latest = e;
      if (e.category === "DUPLICATE") continue;
      eligible++;
      if (PAIR.has(e.category) && e.reviewStatus !== "REJECTED") {
        matched++;
        if (e.needsReview && e.reviewStatus === "PENDING") matchedPendingReview++;
      }
      if (e.category === "MISSING_IN_2B") {
        missingIn2b++;
        missingPeriods.add(e.period);
        if (e.reviewStatus === "PENDING") outstanding++;
      } else if (e.needsReview && e.reviewStatus === "PENDING") {
        outstanding++;
      }
    }
    // Prefer the most recent non-empty supplier name.
    for (const e of [...list].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())) {
      if (e.supplierName) {
        name = e.supplierName;
        break;
      }
    }
    const periods = list.map((e) => e.period).sort();
    out.push({
      supplierGstin: gstin,
      supplierName: name,
      eligible,
      matched,
      matchedPendingReview,
      matchRate: eligible ? Math.round((matched / eligible) * 1000) / 10 : null,
      missingIn2b,
      outstanding,
      periodsWithMissing: missingPeriods.size,
      firstPeriod: periods[0],
      lastPeriod: periods[periods.length - 1],
      lastReconciledAt: latest.completedAt,
      clients: clients.size,
    });
  }
  // Lowest rate first (most in need of attention); undefined rates last.
  return out.sort((a, b) => (a.matchRate ?? 101) - (b.matchRate ?? 101) || b.outstanding - a.outstanding);
}
