import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReconConfig } from "../src/lib/recon/config";
import { DEFAULT_CONFIG, reconcile } from "../src/lib/recon/engine";

test("missing or corrupted settings fall back to defaults", () => {
  assert.deepEqual(resolveReconConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(resolveReconConfig("garbage"), DEFAULT_CONFIG);
  assert.deepEqual(resolveReconConfig({ roundingTolerancePaise: "100", fuzzy: { minInvoiceSimilarity: NaN } }), DEFAULT_CONFIG);
});

test("values are clamped to safe ranges", () => {
  const c = resolveReconConfig({
    roundingTolerancePaise: 999999,
    fuzzy: { minInvoiceSimilarity: 0.1, maxValueDiffPct: 80 },
    probable: { maxValueDiffPct: -5, maxDateDiffDays: 400 },
  });
  assert.equal(c.roundingTolerancePaise, 10000);
  assert.equal(c.fuzzy.minInvoiceSimilarity, 0.6);
  assert.equal(c.fuzzy.maxValueDiffPct, 20);
  assert.equal(c.probable.maxValueDiffPct, 0);
  assert.equal(c.probable.maxDateDiffDays, 60);
  assert.deepEqual(c.weights, DEFAULT_CONFIG.weights);
});

test("a stricter tolerance changes the engine's outcome", () => {
  const rec = (id: string, cgst: number) => ({
    id, gstin: "08ABCDE1234F1Z0", invoiceNo: "A-1", invoiceDate: "2026-04-05", docType: "INVOICE" as const,
    taxable: 100000, cgst, sgst: 9000, igst: 0, cess: 0,
  });
  const pr = [rec("p", 9050)]; // ₹0.50 off
  const b = [rec("b", 9000)];
  assert.equal(reconcile(pr, b, resolveReconConfig({}))[0].category, "EXACT");
  assert.equal(reconcile(pr, b, resolveReconConfig({ roundingTolerancePaise: 0 }))[0].category, "FUZZY");
});
