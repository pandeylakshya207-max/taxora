import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMapping, normalizeHeader } from "../src/lib/recon/import";
import { periodWarning } from "../src/lib/recon/period-check";

test("headers ending in 'rs' are not mistaken for a currency suffix", () => {
  assert.equal(normalizeHeader("Particulars"), "particulars");
  assert.equal(detectMapping(["Date", "Particulars", "Party GSTIN"]).supplierName, 1);
  assert.equal(detectMapping(["Name of Suppliers", "GSTIN"]).gstin, 1);
});

test("currency markers are still removed", () => {
  for (const h of ["Taxable Value (₹)", "Taxable Value (Rs)", "Taxable Value Rs.", "Taxable Value (in INR)", "Taxable Value INR", "Taxable value ₹"]) {
    assert.equal(normalizeHeader(h), "taxablevalue", h);
  }
  assert.equal(normalizeHeader("Integrated Tax(₹)"), "integratedtax");
});

test("period check: wrong month's file is flagged, late invoices are normal", () => {
  const july = ["2026-07-04", "2026-07-10", "2026-07-15"];
  assert.match(periodWarning(july, "2026-08")!, /3 of 3 invoices are dated outside August 2026 \(most are from July 2026\)/);
  assert.equal(periodWarning(["2026-08-02", "2026-08-09", "2026-07-30"], "2026-08"), null);
  assert.match(periodWarning(["2026-08-02", "2026-08-09", "2026-09-03"], "2026-08")!, /1 invoice is dated after August 2026/);
  assert.equal(periodWarning([null, null], "2026-08"), null);
});
