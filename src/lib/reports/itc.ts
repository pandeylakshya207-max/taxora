/**
 * Input-tax-credit review summary, derived only from reconciliation results.
 *
 * These are COMPARISON figures between the purchase register and GSTR-2B.
 * They are not a computation of eligible ITC: eligibility depends on law,
 * facts (e.g. blocked credits, time limits, payment to supplier) and
 * professional judgement, none of which this calculation knows about.
 *
 * "Tax" = IGST + CGST + SGST + cess. All figures in paise.
 */

import type { Paise } from "../recon/money";
import { sideTax, type ReportLine } from "./types";

export type ItcBucket = { count: number; tax: Paise };

export type ItcSummary = {
  /** Total tax on all GSTR-2B rows that were imported. */
  gstr2bTax: Paise;
  /** Total tax on all purchase-register rows that were imported. */
  booksTax: Paise;
  /** Exact matches, plus other matches a reviewer accepted. Tax as per GSTR-2B. */
  supportedByMatch: ItcBucket;
  /** Fuzzy / probable / GSTIN-mismatch pairs still awaiting review. Tax as per GSTR-2B. */
  awaitingReview: ItcBucket;
  /** Pairs a reviewer rejected. Tax as per the books. */
  rejectedMatches: ItcBucket;
  /** In the books, not found in GSTR-2B. Tax as per the books. */
  notInGstr2b: ItcBucket;
  /** In GSTR-2B, not recorded in the books. Tax as per GSTR-2B. */
  notInBooks: ItcBucket;
  /** Repeated entries in the books (possible double claim). Tax as per the books. */
  duplicateInBooks: ItcBucket;
  /** On paired invoices, where the books record MORE tax than GSTR-2B: sum of the excess. */
  excessOverGstr2bOnPairs: ItcBucket;
};

const PAIR = new Set(["EXACT", "FUZZY", "PROBABLE", "GSTIN_MISMATCH"]);

const add = (b: ItcBucket, tax: Paise | null) => {
  b.count += 1;
  b.tax += tax ?? 0;
};
const bucket = (): ItcBucket => ({ count: 0, tax: 0 });

export function computeItcSummary(lines: ReportLine[]): ItcSummary {
  const s: ItcSummary = {
    gstr2bTax: 0,
    booksTax: 0,
    supportedByMatch: bucket(),
    awaitingReview: bucket(),
    rejectedMatches: bucket(),
    notInGstr2b: bucket(),
    notInBooks: bucket(),
    duplicateInBooks: bucket(),
    excessOverGstr2bOnPairs: bucket(),
  };

  for (const l of lines) {
    const prTax = sideTax(l.pr);
    const bTax = sideTax(l.b2b);
    s.booksTax += prTax ?? 0;
    s.gstr2bTax += bTax ?? 0;

    if (PAIR.has(l.category)) {
      if (l.reviewStatus === "REJECTED") add(s.rejectedMatches, prTax);
      else if (l.category === "EXACT" || l.reviewStatus === "ACCEPTED") add(s.supportedByMatch, bTax);
      else add(s.awaitingReview, bTax);

      if (l.reviewStatus !== "REJECTED" && prTax !== null && bTax !== null && prTax - bTax > 0) {
        add(s.excessOverGstr2bOnPairs, prTax - bTax);
      }
    } else if (l.category === "MISSING_IN_2B") {
      add(s.notInGstr2b, prTax);
    } else if (l.category === "MISSING_IN_PR") {
      add(s.notInBooks, bTax);
    } else if (l.category === "DUPLICATE") {
      // A duplicate can be on either side; only book duplicates risk a double claim.
      if (l.pr) add(s.duplicateInBooks, prTax);
    }
  }
  return s;
}

export const ITC_LABELS: { key: Exclude<keyof ItcSummary, "gstr2bTax" | "booksTax">; label: string; help: string; tone: "good" | "warn" | "bad" | "info" }[] = [
  { key: "supportedByMatch", label: "Matched to GSTR-2B", help: "Exact matches and matches accepted by a reviewer (tax as per GSTR-2B).", tone: "good" },
  { key: "awaitingReview", label: "Matches awaiting review", help: "Fuzzy, probable and GSTIN-mismatch pairs not yet reviewed (tax as per GSTR-2B).", tone: "warn" },
  { key: "notInGstr2b", label: "In books, not in GSTR-2B", help: "Credit recorded in the books with no matching GSTR-2B entry (tax as per books).", tone: "bad" },
  { key: "excessOverGstr2bOnPairs", label: "Books exceed GSTR-2B on matched invoices", help: "Where the books record more tax than GSTR-2B for the same invoice: the excess.", tone: "bad" },
  { key: "rejectedMatches", label: "Rejected matches", help: "Pairs a reviewer rejected (tax as per books).", tone: "bad" },
  { key: "duplicateInBooks", label: "Duplicate entries in books", help: "Repeated purchase-register entries; possible double claim (tax as per books).", tone: "bad" },
  { key: "notInBooks", label: "In GSTR-2B, not in books", help: "Supplies reported by suppliers but not recorded in the books (tax as per GSTR-2B).", tone: "info" },
];
