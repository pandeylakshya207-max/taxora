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

import { sourceWarning } from "../src/lib/recon/source-check";

const PORTAL = ["GSTIN of supplier", "Trade/Legal name", "Invoice number", "Invoice type", "Invoice Date", "Invoice Value(₹)", "Place of supply", "Supply Attract Reverse Charge", "Taxable Value (₹)", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)", "Cess(₹)", "GSTR-1/IFF/GSTR-5 Period", "GSTR-1/IFF/GSTR-5 Filing Date", "ITC Availability"];
const TALLY = ["Date", "Particulars", "Party GSTIN", "Supplier Invoice No", "Taxable Value", "IGST", "CGST", "SGST", "Cess", "Invoice Value"];

test("swapped uploads are flagged; correct uploads are not", () => {
  const sheets = ["Read me", "ITC Available", "B2B", "B2B-CDNR"];
  assert.match(sourceWarning("PURCHASE_REGISTER", sheets, PORTAL)!, /looks like a GSTR-2B download/);
  assert.match(sourceWarning("GSTR2B", ["Sheet1"], TALLY)!, /does not look like a GSTR-2B/);
  assert.equal(sourceWarning("GSTR2B", sheets, PORTAL), null);
  assert.equal(sourceWarning("PURCHASE_REGISTER", ["Sheet1"], TALLY), null);
});
