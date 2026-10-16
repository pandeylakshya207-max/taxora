import { test } from "node:test";
import assert from "node:assert/strict";
import { computeItcSummary } from "../src/lib/reports/itc";
import type { ReportLine, ReportSide } from "../src/lib/reports/types";

const side = (tax: number): ReportSide => ({
  sourceRow: 2, gstin: "08AAACS1111A1ZA", supplierName: null, invoiceNo: "X", invoiceDate: "2026-04-05",
  docType: "INVOICE", taxable: 100000, igst: 0, cgst: tax / 2, sgst: tax / 2, cess: 0,
});
const line = (category: string, reviewStatus: ReportLine["reviewStatus"], prTax: number | null, bTax: number | null): ReportLine => ({
  category, flags: [], reason: "", needsReview: category !== "EXACT", reviewStatus, reviewNote: null, score: null,
  pr: prTax === null ? null : side(prTax), b2b: bTax === null ? null : side(bTax), diffTotal: null, diffTaxable: null, diffTax: null,
});

test("ITC summary buckets every line and totals match both sources", () => {
  const lines = [
    line("EXACT", "ACCEPTED", 1800, 1800),
    line("FUZZY", "ACCEPTED", 2000, 1800), // accepted; books exceed 2B by 200
    line("PROBABLE", "PENDING", 900, 1000),
    line("GSTIN_MISMATCH", "REJECTED", 500, 500),
    line("MISSING_IN_2B", "PENDING", 700, null),
    line("MISSING_IN_PR", "PENDING", null, 300),
    line("DUPLICATE", "PENDING", 1800, null),
    line("DUPLICATE", "PENDING", null, 400), // 2B-side duplicate: not a books double claim
  ];
  const s = computeItcSummary(lines);
  assert.equal(s.booksTax, 1800 + 2000 + 900 + 500 + 700 + 1800);
  assert.equal(s.gstr2bTax, 1800 + 1800 + 1000 + 500 + 300 + 400);
  assert.deepEqual(s.supportedByMatch, { count: 2, tax: 3600 });
  assert.deepEqual(s.awaitingReview, { count: 1, tax: 1000 });
  assert.deepEqual(s.rejectedMatches, { count: 1, tax: 500 });
  assert.deepEqual(s.notInGstr2b, { count: 1, tax: 700 });
  assert.deepEqual(s.notInBooks, { count: 1, tax: 300 });
  assert.deepEqual(s.duplicateInBooks, { count: 1, tax: 1800 });
  assert.deepEqual(s.excessOverGstr2bOnPairs, { count: 1, tax: 200 });
});

test("Credit notes reduce tax (negative amounts flow through)", () => {
  const s = computeItcSummary([line("EXACT", "ACCEPTED", 1800, 1800), line("EXACT", "ACCEPTED", -360, -360)]);
  assert.equal(s.supportedByMatch.tax, 1440);
  assert.equal(s.booksTax, 1440);
});

test("Rejected pairs never count as excess or as supported", () => {
  const s = computeItcSummary([line("FUZZY", "REJECTED", 5000, 1000)]);
  assert.equal(s.excessOverGstr2bOnPairs.count, 0);
  assert.equal(s.supportedByMatch.count, 0);
  assert.equal(s.rejectedMatches.tax, 5000);
});
