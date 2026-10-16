/**
 * Taxora GST reconciliation engine: purchase register (PR) vs GSTR-2B.
 *
 * Pure functions, no database, no UI — so every rule here is unit-tested.
 *
 * HOW RECORDS ARE CLASSIFIED (in this order, each record lands in exactly one result):
 *
 *  0. DUPLICATE        Same GSTIN + document type + normalised invoice no. appears more than
 *                      once in the SAME source. The first is kept for matching; the rest are
 *                      set aside for review rather than being matched or silently dropped.
 *  1. EXACT            Same GSTIN, document type, normalised invoice no. and date, and every
 *                      amount (taxable, CGST, SGST, IGST, cess) within the rounding tolerance.
 *  2. FUZZY            Same GSTIN and document type, invoice-number similarity ≥ threshold
 *                      (default 85%) and total value within threshold (default 5%).
 *  3. PROBABLE         Same GSTIN and document type, total value within threshold (default 2%)
 *                      and dates within the window (default 7 days).
 *  4. GSTIN_MISMATCH   Same document type, identical normalised invoice no., total value within
 *                      1%, but the GSTINs differ while sharing the same PAN (or differ by 1–2
 *                      characters) — a likely GSTIN typo on one side.
 *  5. MISSING_IN_2B    Purchase-register record with no counterpart.
 *     MISSING_IN_PR    GSTR-2B record with no counterpart.
 *
 * SAFEGUARDS
 *  - One-to-one: a record is used in at most one pair.
 *  - Ambiguity: if a record's two best candidates are within `ambiguityMargin` of each other,
 *    nothing is paired automatically; the record is flagged AMBIGUOUS with its candidates.
 *  - A score never hides a conflict: any amount or tax-head difference is reported as a flag,
 *    and every non-exact result needs human review.
 *  - Credit notes only pair with credit notes, invoices with invoices.
 *  - A match is evidence for review. It is NOT a determination of ITC eligibility.
 */

import type { Paise } from "./money";
import { daysBetween, normalizeInvoiceNo, similarity } from "./normalize";

export type DocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";

export type InvoiceRecord = {
  id: string;
  gstin: string; // normalised upper-case
  supplierName?: string | null;
  invoiceNo: string; // original, as imported
  invoiceDate: string | null; // ISO YYYY-MM-DD
  docType: DocType;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  cess: Paise;
};

export type ReconConfig = {
  /** Allowed difference per amount for EXACT and for flagging, in paise. Default ₹1. */
  roundingTolerancePaise: number;
  fuzzy: { minInvoiceSimilarity: number; maxValueDiffPct: number };
  probable: { maxValueDiffPct: number; maxDateDiffDays: number };
  gstinMismatch: { maxValueDiffPct: number };
  /** Two candidates closer than this in score (0–1) are treated as ambiguous. */
  ambiguityMargin: number;
  /** Score weights in percent; must sum to 100. */
  weights: { gstin: number; invoiceNo: number; amount: number; date: number };
};

export const DEFAULT_CONFIG: ReconConfig = {
  roundingTolerancePaise: 100,
  fuzzy: { minInvoiceSimilarity: 0.85, maxValueDiffPct: 5 },
  probable: { maxValueDiffPct: 2, maxDateDiffDays: 7 },
  gstinMismatch: { maxValueDiffPct: 1 },
  ambiguityMargin: 0.02,
  weights: { gstin: 40, invoiceNo: 30, amount: 20, date: 10 },
};

export type Category =
  | "EXACT"
  | "FUZZY"
  | "PROBABLE"
  | "GSTIN_MISMATCH"
  | "MISSING_IN_2B"
  | "MISSING_IN_PR"
  | "DUPLICATE";

export type Flag =
  | "TAXABLE_DIFF"
  | "TAX_DIFF"
  | "TAX_TYPE_CONFLICT"
  | "DATE_DIFF"
  | "INVOICE_NO_DIFF"
  | "AMBIGUOUS";

export type AmountDiffs = {
  /** purchase register minus GSTR-2B, in paise */
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  cess: Paise;
  total: Paise;
};

export type ScoreBreakdown = {
  gstin: number;
  invoiceNo: number;
  amount: number;
  date: number;
  /** weighted total, 0–100 */
  total: number;
};

export type ReconResult = {
  category: Category;
  prId: string | null;
  gstr2bId: string | null;
  flags: Flag[];
  reasons: string[];
  needsReview: boolean;
  score: ScoreBreakdown | null;
  diffs: AmountDiffs | null;
  /** For DUPLICATE: the record it duplicates. For AMBIGUOUS: the candidate ids. */
  relatedIds: string[];
};

export type ReconSummary = {
  prRecords: number;
  gstr2bRecords: number;
  byCategory: Record<Category, number>;
  byFlag: Record<Flag, number>;
  needsReview: number;
};

// ───────────────────────── helpers ─────────────────────────

const totalOf = (r: InvoiceRecord) => r.taxable + r.cgst + r.sgst + r.igst + r.cess;

function diffsOf(pr: InvoiceRecord, b: InvoiceRecord): AmountDiffs {
  return {
    taxable: pr.taxable - b.taxable,
    cgst: pr.cgst - b.cgst,
    sgst: pr.sgst - b.sgst,
    igst: pr.igst - b.igst,
    cess: pr.cess - b.cess,
    total: totalOf(pr) - totalOf(b),
  };
}

/** % difference of total value, relative to the larger absolute value. */
function valueDiffPct(pr: InvoiceRecord, b: InvoiceRecord): number {
  const a = totalOf(pr);
  const c = totalOf(b);
  const base = Math.max(Math.abs(a), Math.abs(c));
  if (base === 0) return 0;
  return (Math.abs(a - c) / base) * 100;
}

/** Intra-state (CGST+SGST) vs inter-state (IGST) disagreement between the two sides. */
function taxTypeConflict(pr: InvoiceRecord, b: InvoiceRecord): boolean {
  const kind = (r: InvoiceRecord) => (r.igst !== 0 ? "inter" : r.cgst !== 0 || r.sgst !== 0 ? "intra" : "none");
  const k1 = kind(pr);
  const k2 = kind(b);
  return k1 !== "none" && k2 !== "none" && k1 !== k2;
}

function flagsFor(pr: InvoiceRecord, b: InvoiceRecord, cfg: ReconConfig): { flags: Flag[]; reasons: string[] } {
  const tol = cfg.roundingTolerancePaise;
  const d = diffsOf(pr, b);
  const flags: Flag[] = [];
  const reasons: string[] = [];
  const rupees = (p: number) => `₹${(Math.abs(p) / 100).toFixed(2)}`;

  if (Math.abs(d.taxable) > tol) {
    flags.push("TAXABLE_DIFF");
    reasons.push(`Taxable value differs by ${rupees(d.taxable)} (purchase register ${d.taxable > 0 ? "higher" : "lower"}).`);
  }
  if (taxTypeConflict(pr, b)) {
    flags.push("TAX_TYPE_CONFLICT");
    reasons.push("One side records IGST (inter-state) and the other CGST+SGST (intra-state).");
  } else {
    const heads = (["cgst", "sgst", "igst", "cess"] as const).filter((h) => Math.abs(d[h]) > tol);
    if (heads.length) {
      flags.push("TAX_DIFF");
      reasons.push(`Tax differs in ${heads.map((h) => `${h.toUpperCase()} by ${rupees(d[h])}`).join(", ")}.`);
    }
  }
  if (pr.invoiceDate && b.invoiceDate && pr.invoiceDate !== b.invoiceDate) {
    flags.push("DATE_DIFF");
    reasons.push(`Invoice dates differ: ${pr.invoiceDate} vs ${b.invoiceDate} (${daysBetween(pr.invoiceDate, b.invoiceDate)} day(s)).`);
  }
  if (normalizeInvoiceNo(pr.invoiceNo) !== normalizeInvoiceNo(b.invoiceNo)) {
    flags.push("INVOICE_NO_DIFF");
    reasons.push(`Invoice numbers differ: "${pr.invoiceNo}" vs "${b.invoiceNo}".`);
  }
  return { flags, reasons };
}

function scoreOf(pr: InvoiceRecord, b: InvoiceRecord, cfg: ReconConfig): ScoreBreakdown {
  const w = cfg.weights;
  const gstin = pr.gstin === b.gstin ? 1 : similarity(pr.gstin, b.gstin);
  const invoiceNo = similarity(normalizeInvoiceNo(pr.invoiceNo), normalizeInvoiceNo(b.invoiceNo));
  const amount = Math.max(0, 1 - valueDiffPct(pr, b) / 100);
  const date =
    pr.invoiceDate && b.invoiceDate ? Math.max(0, 1 - daysBetween(pr.invoiceDate, b.invoiceDate) / 30) : 0;
  const total = gstin * w.gstin + invoiceNo * w.invoiceNo + amount * w.amount + date * w.date;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { gstin: r(gstin), invoiceNo: r(invoiceNo), amount: r(amount), date: r(date), total: Math.round(total * 10) / 10 };
}

const keyOf = (r: InvoiceRecord) => `${r.gstin}|${r.docType}|${normalizeInvoiceNo(r.invoiceNo)}`;

function isExact(pr: InvoiceRecord, b: InvoiceRecord, tol: number): boolean {
  return (
    keyOf(pr) === keyOf(b) &&
    pr.invoiceDate !== null &&
    pr.invoiceDate === b.invoiceDate &&
    (["taxable", "cgst", "sgst", "igst", "cess"] as const).every((k) => Math.abs(pr[k] - b[k]) <= tol)
  );
}

function samePanOrNearGstin(a: string, b: string): boolean {
  if (a.length === 15 && b.length === 15 && a.slice(2, 12) === b.slice(2, 12)) return true;
  return a.length === b.length && editDistanceAtMost2(a, b);
}

function editDistanceAtMost2(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 2) return false;
  return diff > 0;
}

// ───────────────────────── engine ─────────────────────────

export function reconcile(
  purchaseRegister: InvoiceRecord[],
  gstr2b: InvoiceRecord[],
  config: ReconConfig = DEFAULT_CONFIG,
): ReconResult[] {
  const w = config.weights;
  if (w.gstin + w.invoiceNo + w.amount + w.date !== 100) {
    throw new Error("Reconciliation weights must sum to 100.");
  }

  const results: ReconResult[] = [];

  // 0. Duplicates within each source.
  const dedupe = (records: InvoiceRecord[], side: "pr" | "2b") => {
    const seen = new Map<string, InvoiceRecord>();
    const primaries: InvoiceRecord[] = [];
    for (const r of records) {
      const first = seen.get(keyOf(r));
      if (first) {
        results.push({
          category: "DUPLICATE",
          prId: side === "pr" ? r.id : null,
          gstr2bId: side === "2b" ? r.id : null,
          flags: [],
          reasons: [
            `Same supplier GSTIN, document type and invoice number ("${r.invoiceNo}") already appears in the ${
              side === "pr" ? "purchase register" : "GSTR-2B"
            }. Set aside for review instead of being matched.`,
          ],
          needsReview: true,
          score: null,
          diffs: null,
          relatedIds: [first.id],
        });
      } else {
        seen.set(keyOf(r), r);
        primaries.push(r);
      }
    }
    return primaries;
  };
  const prs = dedupe(purchaseRegister, "pr");
  const b2bs = dedupe(gstr2b, "2b");

  const usedPr = new Set<string>();
  const usedB = new Set<string>();
  const pair = (category: Category, pr: InvoiceRecord, b: InvoiceRecord, lead: string) => {
    const { flags, reasons } = flagsFor(pr, b, config);
    usedPr.add(pr.id);
    usedB.add(b.id);
    results.push({
      category,
      prId: pr.id,
      gstr2bId: b.id,
      flags,
      reasons: [lead, ...reasons],
      needsReview: category !== "EXACT",
      score: scoreOf(pr, b, config),
      diffs: diffsOf(pr, b),
      relatedIds: [],
    });
  };

  // 1. Exact matches (keys are unique after de-duplication, so this is one-to-one).
  const bByKey = new Map(b2bs.map((b) => [keyOf(b), b]));
  for (const pr of prs) {
    const b = bByKey.get(keyOf(pr));
    if (b && !usedB.has(b.id) && isExact(pr, b, config.roundingTolerancePaise)) {
      pair("EXACT", pr, b, "GSTIN, document type, invoice number, date and all amounts agree (within rounding tolerance).");
    }
  }

  // 2 & 3. Fuzzy and probable candidates within the same GSTIN and document type.
  type Edge = { pr: InvoiceRecord; b: InvoiceRecord; level: 2 | 3; score: number };
  const bByGroup = new Map<string, InvoiceRecord[]>();
  for (const b of b2bs) {
    if (usedB.has(b.id)) continue;
    const g = `${b.gstin}|${b.docType}`;
    (bByGroup.get(g) ?? bByGroup.set(g, []).get(g)!).push(b);
  }
  const edges: Edge[] = [];
  for (const pr of prs) {
    if (usedPr.has(pr.id)) continue;
    for (const b of bByGroup.get(`${pr.gstin}|${pr.docType}`) ?? []) {
      const pct = valueDiffPct(pr, b);
      const sim = similarity(normalizeInvoiceNo(pr.invoiceNo), normalizeInvoiceNo(b.invoiceNo));
      const days = pr.invoiceDate && b.invoiceDate ? daysBetween(pr.invoiceDate, b.invoiceDate) : Infinity;
      const score = scoreOf(pr, b, config).total / 100;
      if (sim >= config.fuzzy.minInvoiceSimilarity && pct <= config.fuzzy.maxValueDiffPct) {
        edges.push({ pr, b, level: 2, score });
      } else if (pct <= config.probable.maxValueDiffPct && days <= config.probable.maxDateDiffDays) {
        edges.push({ pr, b, level: 3, score });
      }
    }
  }

  // Ambiguity: a record whose best two candidates (at its best level) are too close to call.
  const ambiguous = new Map<string, string[]>(); // record id -> candidate ids
  const markAmbiguity = (byId: Map<string, Edge[]>, otherId: (e: Edge) => string) => {
    for (const [id, list] of byId) {
      const bestLevel = Math.min(...list.map((e) => e.level));
      const top = list.filter((e) => e.level === bestLevel).sort((x, y) => y.score - x.score);
      if (top.length > 1 && top[0].score - top[1].score < config.ambiguityMargin) {
        ambiguous.set(id, top.filter((e) => top[0].score - e.score < config.ambiguityMargin).map(otherId));
      }
    }
  };
  const byPr = new Map<string, Edge[]>();
  const byB = new Map<string, Edge[]>();
  for (const e of edges) {
    (byPr.get(e.pr.id) ?? byPr.set(e.pr.id, []).get(e.pr.id)!).push(e);
    (byB.get(e.b.id) ?? byB.set(e.b.id, []).get(e.b.id)!).push(e);
  }
  markAmbiguity(byPr, (e) => e.b.id);
  markAmbiguity(byB, (e) => e.pr.id);

  // Greedy one-to-one: better level first, then higher score; stable on input order.
  edges.sort((x, y) => x.level - y.level || y.score - x.score);
  for (const e of edges) {
    if (usedPr.has(e.pr.id) || usedB.has(e.b.id)) continue;
    if (ambiguous.has(e.pr.id) || ambiguous.has(e.b.id)) continue;
    const pct = valueDiffPct(e.pr, e.b).toFixed(2);
    if (e.level === 2) {
      const sim = Math.round(similarity(normalizeInvoiceNo(e.pr.invoiceNo), normalizeInvoiceNo(e.b.invoiceNo)) * 100);
      pair("FUZZY", e.pr, e.b, `Same GSTIN; invoice numbers ${sim}% similar; total value differs by ${pct}%.`);
    } else {
      const days = daysBetween(e.pr.invoiceDate!, e.b.invoiceDate!);
      pair("PROBABLE", e.pr, e.b, `Same GSTIN; total value differs by ${pct}%; dates ${days} day(s) apart.`);
    }
  }

  // 4. Likely GSTIN typos: identical invoice number and value, GSTINs nearly the same.
  const restB = b2bs.filter((b) => !usedB.has(b.id) && !ambiguous.has(b.id));
  for (const pr of prs) {
    if (usedPr.has(pr.id) || ambiguous.has(pr.id)) continue;
    const norm = normalizeInvoiceNo(pr.invoiceNo);
    const candidates = restB.filter(
      (b) =>
        !usedB.has(b.id) &&
        b.gstin !== pr.gstin &&
        b.docType === pr.docType &&
        normalizeInvoiceNo(b.invoiceNo) === norm &&
        valueDiffPct(pr, b) <= config.gstinMismatch.maxValueDiffPct &&
        samePanOrNearGstin(pr.gstin, b.gstin),
    );
    if (candidates.length === 1) {
      pair(
        "GSTIN_MISMATCH",
        pr,
        candidates[0],
        `Invoice number and value agree, but the supplier GSTIN differs (${pr.gstin} vs ${candidates[0].gstin}). Check for a GSTIN error on either side.`,
      );
    } else if (candidates.length > 1) {
      ambiguous.set(pr.id, candidates.map((c) => c.id));
    }
  }

  // 5. Everything left is unmatched. Ambiguous records carry their candidates.
  for (const pr of prs) {
    if (usedPr.has(pr.id)) continue;
    const cands = ambiguous.get(pr.id);
    results.push({
      category: "MISSING_IN_2B",
      prId: pr.id,
      gstr2bId: null,
      flags: cands ? ["AMBIGUOUS"] : [],
      reasons: cands
        ? [`${cands.length} GSTR-2B records match almost equally well, so none was paired automatically. Choose the right one manually.`]
        : ["No matching record was found in GSTR-2B for this purchase-register entry."],
      needsReview: true,
      score: null,
      diffs: null,
      relatedIds: cands ?? [],
    });
  }
  for (const b of b2bs) {
    if (usedB.has(b.id)) continue;
    const cands = ambiguous.get(b.id);
    results.push({
      category: "MISSING_IN_PR",
      prId: null,
      gstr2bId: b.id,
      flags: cands ? ["AMBIGUOUS"] : [],
      reasons: cands
        ? [`${cands.length} purchase-register records match almost equally well, so none was paired automatically. Choose the right one manually.`]
        : ["This GSTR-2B record has no matching entry in the purchase register."],
      needsReview: true,
      score: null,
      diffs: null,
      relatedIds: cands ?? [],
    });
  }

  return results;
}

/** Counts derived only from the results, so the summary always agrees with the detail. */
export function summarize(prCount: number, gstr2bCount: number, results: ReconResult[]): ReconSummary {
  const byCategory: Record<Category, number> = {
    EXACT: 0, FUZZY: 0, PROBABLE: 0, GSTIN_MISMATCH: 0, MISSING_IN_2B: 0, MISSING_IN_PR: 0, DUPLICATE: 0,
  };
  const byFlag: Record<Flag, number> = {
    TAXABLE_DIFF: 0, TAX_DIFF: 0, TAX_TYPE_CONFLICT: 0, DATE_DIFF: 0, INVOICE_NO_DIFF: 0, AMBIGUOUS: 0,
  };
  let needsReview = 0;
  for (const r of results) {
    byCategory[r.category]++;
    for (const f of r.flags) byFlag[f]++;
    if (r.needsReview) needsReview++;
  }
  return { prRecords: prCount, gstr2bRecords: gstr2bCount, byCategory, byFlag, needsReview };
}
