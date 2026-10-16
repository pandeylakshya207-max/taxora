import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPaise, parseAmount } from "../src/lib/recon/money";
import { normalizeInvoiceNo, parseInvoiceDate, similarity } from "../src/lib/recon/normalize";
import { reconcile, summarize, type InvoiceRecord, type ReconResult } from "../src/lib/recon/engine";

// Synthetic GSTINs (valid format; not real businesses).
const G1 = "08ABCDE1234F1Z0";
const G2 = "27PQRST5678K1Z2";

let seq = 0;
function rec(p: Partial<InvoiceRecord> & { invoiceNo: string }): InvoiceRecord {
  return {
    id: p.id ?? `r${++seq}`,
    gstin: G1,
    invoiceDate: "2026-04-05",
    docType: "INVOICE",
    taxable: 10000000, // ₹1,00,000.00
    cgst: 900000, // ₹9,000
    sgst: 900000,
    igst: 0,
    cess: 0,
    ...p,
  };
}

/** Every input record must appear in exactly one result. */
function assertAccounted(pr: InvoiceRecord[], b: InvoiceRecord[], results: ReconResult[]) {
  const prSeen = results.flatMap((r) => (r.prId ? [r.prId] : []));
  const bSeen = results.flatMap((r) => (r.gstr2bId ? [r.gstr2bId] : []));
  assert.deepEqual([...prSeen].sort(), pr.map((r) => r.id).sort(), "each PR record exactly once");
  assert.deepEqual([...bSeen].sort(), b.map((r) => r.id).sort(), "each 2B record exactly once");
}

const only = (results: ReconResult[], category: string) => results.filter((r) => r.category === category);

// ───────────── money ─────────────

test("parseAmount handles Indian formats exactly, in paise", () => {
  assert.equal(parseAmount("1,24,500.00"), 12450000);
  assert.equal(parseAmount("₹ 1,24,500.5"), 12450050);
  assert.equal(parseAmount("Rs. 99.995"), 10000); // half away from zero
  assert.equal(parseAmount("(500.00)"), -50000);
  assert.equal(parseAmount("-500"), -50000);
  assert.equal(parseAmount(1234.56), 123456);
  assert.equal(parseAmount(0.1 + 0.2), 30); // floating point noise removed
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("12.3.4"), null);
});

test("formatPaise uses Indian digit grouping", () => {
  assert.equal(formatPaise(12450050), "1,24,500.50");
  assert.equal(formatPaise(1234567890), "1,23,45,678.90");
  assert.equal(formatPaise(-50000), "-500.00");
  assert.equal(formatPaise(5), "0.05");
});

// ───────────── normalisation ─────────────

test("invoice numbers normalise across separators, case and leading zeros", () => {
  assert.equal(normalizeInvoiceNo("DSW/23-24/88"), "DSW232488");
  assert.equal(normalizeInvoiceNo("dsw-2324-088"), "DSW232488");
  assert.equal(normalizeInvoiceNo(" DSW 23-24/0088 "), "DSW232488");
  assert.equal(normalizeInvoiceNo("INV-000"), "INV0");
  assert.notEqual(normalizeInvoiceNo("INV-101"), normalizeInvoiceNo("INV-110"));
});

test("dates parse day-first, Excel serials and month names; impossible dates rejected", () => {
  assert.equal(parseInvoiceDate("05-04-2026"), "2026-04-05");
  assert.equal(parseInvoiceDate("5/4/26"), "2026-04-05");
  assert.equal(parseInvoiceDate("2026-04-05"), "2026-04-05");
  assert.equal(parseInvoiceDate("05-Apr-2026"), "2026-04-05");
  assert.equal(parseInvoiceDate("5 September 2026"), "2026-09-05");
  assert.equal(parseInvoiceDate(46117), "2026-04-05");
  assert.equal(parseInvoiceDate("31-02-2026"), null);
  assert.equal(parseInvoiceDate("not a date"), null);
});

test("similarity is 1 for identical and lower for different strings", () => {
  assert.equal(similarity("ABC", "ABC"), 1);
  assert.ok(similarity("INV1001", "INV1007") > 0.85);
  assert.ok(similarity("INV1001", "XYZ9") < 0.5);
});

// ───────────── engine ─────────────

test("EXACT: identical records match and need no review", () => {
  const pr = [rec({ id: "p1", invoiceNo: "INV-1001" })];
  const b = [rec({ id: "b1", invoiceNo: "inv/1001" })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(res.length, 1);
  assert.equal(res[0].category, "EXACT");
  assert.equal(res[0].needsReview, false);
  assert.deepEqual(res[0].flags, []);
});

test("EXACT tolerates rounding within ₹1, but not more", () => {
  const pr = [rec({ id: "p1", invoiceNo: "A1", cgst: 900050 })]; // +₹0.50
  const b = [rec({ id: "b1", invoiceNo: "A1" })];
  assert.equal(reconcile(pr, b)[0].category, "EXACT");

  const pr2 = [rec({ id: "p2", invoiceNo: "A2", cgst: 900500 })]; // +₹5.00
  const b2 = [rec({ id: "b2", invoiceNo: "A2" })];
  const r = reconcile(pr2, b2)[0];
  assert.equal(r.category, "FUZZY");
  assert.ok(r.flags.includes("TAX_DIFF"));
  assert.equal(r.diffs?.cgst, 500);
  assert.equal(r.needsReview, true);
});

test("FUZZY: similar invoice number, value within 5%, with every difference flagged", () => {
  const pr = [rec({ id: "p1", invoiceNo: "TE/2026/2210", taxable: 10000000 })];
  const b = [rec({ id: "b1", invoiceNo: "TE/2026/2219", taxable: 10300000, invoiceDate: "2026-04-06" })];
  const r = reconcile(pr, b)[0];
  assert.equal(r.category, "FUZZY");
  assert.ok(r.flags.includes("TAXABLE_DIFF"));
  assert.ok(r.flags.includes("INVOICE_NO_DIFF"));
  assert.ok(r.flags.includes("DATE_DIFF"));
  assert.equal(r.diffs?.taxable, -300000);
  assert.ok(r.score && r.score.total > 80 && r.score.total < 100);
});

test("PROBABLE: different invoice number but value within 2% and dates within 7 days", () => {
  const pr = [rec({ id: "p1", invoiceNo: "EL-5531", invoiceDate: "2026-04-01" })];
  const b = [rec({ id: "b1", invoiceNo: "LOG/APR/77", invoiceDate: "2026-04-04", taxable: 10100000 })];
  const r = reconcile(pr, b)[0];
  assert.equal(r.category, "PROBABLE");
  assert.ok(r.needsReview);
});

test("Not matched when value or date is outside every rule", () => {
  const pr = [rec({ id: "p1", invoiceNo: "X-1", invoiceDate: "2026-04-01" })];
  const b = [rec({ id: "b1", invoiceNo: "Q-99", invoiceDate: "2026-04-20" })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(only(res, "MISSING_IN_2B").length, 1);
  assert.equal(only(res, "MISSING_IN_PR").length, 1);
});

test("Different GSTINs never fuzzy/probable match", () => {
  const pr = [rec({ id: "p1", invoiceNo: "A-100", gstin: G1 })];
  const b = [rec({ id: "b1", invoiceNo: "A-100", gstin: G2 })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(only(res, "FUZZY").length + only(res, "PROBABLE").length + only(res, "EXACT").length, 0);
});

test("GSTIN_MISMATCH: same invoice and value, GSTIN with same PAN", () => {
  const other = "08ABCDE1234F2Z9"; // same PAN, different entity number
  const pr = [rec({ id: "p1", invoiceNo: "A-100", gstin: G1 })];
  const b = [rec({ id: "b1", invoiceNo: "A-100", gstin: other })];
  const r = reconcile(pr, b)[0];
  assert.equal(r.category, "GSTIN_MISMATCH");
  assert.ok(r.needsReview);
});

test("Credit notes only pair with credit notes", () => {
  const pr = [rec({ id: "p1", invoiceNo: "CN-1", docType: "CREDIT_NOTE", taxable: -1000000, cgst: -90000, sgst: -90000 })];
  const b = [rec({ id: "b1", invoiceNo: "CN-1", docType: "INVOICE", taxable: -1000000, cgst: -90000, sgst: -90000 })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(only(res, "EXACT").length, 0);

  const b2 = [rec({ id: "b2", invoiceNo: "CN-1", docType: "CREDIT_NOTE", taxable: -1000000, cgst: -90000, sgst: -90000 })];
  assert.equal(reconcile(pr, b2)[0].category, "EXACT");
});

test("IGST vs CGST+SGST is reported as a tax-type conflict, not hidden", () => {
  const pr = [rec({ id: "p1", invoiceNo: "A-1", cgst: 900000, sgst: 900000, igst: 0 })];
  const b = [rec({ id: "b1", invoiceNo: "A-1", cgst: 0, sgst: 0, igst: 1800000 })];
  const r = reconcile(pr, b)[0];
  assert.equal(r.category, "FUZZY"); // same total, same invoice no
  assert.ok(r.flags.includes("TAX_TYPE_CONFLICT"));
  assert.ok(r.needsReview);
});

test("DUPLICATE: a repeated invoice in one source is set aside, never double-matched", () => {
  const pr = [rec({ id: "p1", invoiceNo: "INV-7" }), rec({ id: "p2", invoiceNo: "inv 7" })];
  const b = [rec({ id: "b1", invoiceNo: "INV-7" })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(only(res, "EXACT").length, 1);
  const dup = only(res, "DUPLICATE");
  assert.equal(dup.length, 1);
  assert.equal(dup[0].prId, "p2");
  assert.deepEqual(dup[0].relatedIds, ["p1"]);
});

test("AMBIGUOUS: two equally good candidates are not auto-paired", () => {
  const pr = [rec({ id: "p1", invoiceNo: "P-1", invoiceDate: "2026-04-05" })];
  const b = [
    rec({ id: "b1", invoiceNo: "Q-7", invoiceDate: "2026-04-03" }),
    rec({ id: "b2", invoiceNo: "Q-8", invoiceDate: "2026-04-07" }),
  ];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  const p = res.find((r) => r.prId === "p1")!;
  assert.equal(p.category, "MISSING_IN_2B");
  assert.ok(p.flags.includes("AMBIGUOUS"));
  assert.deepEqual([...p.relatedIds].sort(), ["b1", "b2"]);
});

test("One-to-one: the better candidate wins and the other stays unmatched", () => {
  const pr = [rec({ id: "p1", invoiceNo: "INV-500" })];
  const b = [
    rec({ id: "b1", invoiceNo: "INV-500", taxable: 10050000 }), // fuzzy, 0.5% off
    rec({ id: "b2", invoiceNo: "ZZZ", taxable: 10100000, invoiceDate: "2026-04-06" }), // only probable
  ];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  assert.equal(res.find((r) => r.prId === "p1")!.gstr2bId, "b1");
  assert.equal(res.find((r) => r.gstr2bId === "b2")!.category, "MISSING_IN_PR");
});

test("Summary is derived from results and always agrees with them", () => {
  const pr = [
    rec({ id: "p1", invoiceNo: "A1" }),
    rec({ id: "p2", invoiceNo: "A2", taxable: 10200000 }),
    rec({ id: "p3", invoiceNo: "A3" }),
    rec({ id: "p4", invoiceNo: "A1" }),
  ];
  const b = [rec({ id: "b1", invoiceNo: "A1" }), rec({ id: "b2", invoiceNo: "A2" }), rec({ id: "b9", invoiceNo: "ZZ-9", invoiceDate: "2026-06-01" })];
  const res = reconcile(pr, b);
  assertAccounted(pr, b, res);
  const s = summarize(pr.length, b.length, res);
  const total = Object.values(s.byCategory).reduce((a, n) => a + n, 0);
  assert.equal(total, res.length);
  assert.equal(s.byCategory.EXACT, 1);
  assert.equal(s.byCategory.FUZZY, 1);
  assert.equal(s.byCategory.DUPLICATE, 1);
  assert.equal(s.byCategory.MISSING_IN_2B, 1);
  assert.equal(s.byCategory.MISSING_IN_PR, 1);
  assert.equal(s.needsReview, res.filter((r) => r.needsReview).length);
});

test("Weights must sum to 100", () => {
  assert.throws(() =>
    reconcile([], [], {
      roundingTolerancePaise: 100,
      fuzzy: { minInvoiceSimilarity: 0.85, maxValueDiffPct: 5 },
      probable: { maxValueDiffPct: 2, maxDateDiffDays: 7 },
      gstinMismatch: { maxValueDiffPct: 1 },
      ambiguityMargin: 0.02,
      weights: { gstin: 50, invoiceNo: 30, amount: 20, date: 10 },
    }),
  );
});

test("Scales: 5,000 x 5,000 records reconcile in reasonable time", () => {
  const pr: InvoiceRecord[] = [];
  const b: InvoiceRecord[] = [];
  for (let i = 0; i < 5000; i++) {
    const gstin = `08ABCDE${String(1000 + (i % 50)).padStart(4, "0")}F1Z0`;
    pr.push(rec({ id: `p${i}`, gstin, invoiceNo: `INV-${i}`, taxable: 100000 + i * 37 }));
    if (i % 10 !== 0) b.push(rec({ id: `b${i}`, gstin, invoiceNo: `INV/${i}`, taxable: 100000 + i * 37 }));
  }
  const start = performance.now();
  const res = reconcile(pr, b);
  const ms = performance.now() - start;
  assertAccounted(pr, b, res);
  assert.equal(only(res, "EXACT").length, 4500);
  assert.ok(ms < 15000, `took ${ms.toFixed(0)}ms`);
});

test("Short invoice numbers that differ by one character stay below the 85% fuzzy threshold", () => {
  // TE2210 vs TE2219 = 83% similar: not FUZZY. Value differs 3%: not PROBABLE either.
  const pr = [rec({ id: "p1", invoiceNo: "TE-2210" })];
  const b = [rec({ id: "b1", invoiceNo: "TE-2219", taxable: 10300000 })];
  const res = reconcile(pr, b);
  assert.equal(res.find((r) => r.prId === "p1")!.category, "MISSING_IN_2B");
});
