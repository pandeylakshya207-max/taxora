import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVendorStats, type VendorEntry } from "../src/lib/vendors/stats";
import { draftSupplierEmail } from "../src/lib/vendors/email";

const e = (p: Partial<VendorEntry>): VendorEntry => ({
  supplierGstin: "08AABCT2222B1Z0", supplierName: "Tara Packaging", clientId: "c1", period: "2026-04",
  completedAt: new Date("2026-05-01"), category: "EXACT", reviewStatus: "ACCEPTED", needsReview: false, ...p,
});

test("matching rate: matched ÷ eligible, duplicates excluded, rejected not matched", () => {
  const [s] = computeVendorStats([
    e({}),
    e({ category: "FUZZY", reviewStatus: "PENDING", needsReview: true }),
    e({ category: "PROBABLE", reviewStatus: "REJECTED", needsReview: true }),
    e({ category: "MISSING_IN_2B", reviewStatus: "PENDING", needsReview: true, period: "2026-05" }),
    e({ category: "DUPLICATE", reviewStatus: "PENDING", needsReview: true }),
  ]);
  assert.equal(s.eligible, 4);
  assert.equal(s.matched, 2);
  assert.equal(s.matchedPendingReview, 1);
  assert.equal(s.matchRate, 50);
  assert.equal(s.missingIn2b, 1);
  assert.equal(s.outstanding, 2); // fuzzy pending + missing pending
  assert.equal(s.periodsWithMissing, 1);
  assert.equal(s.firstPeriod, "2026-04");
  assert.equal(s.lastPeriod, "2026-05");
});

test("rate is undefined (null), not zero, when nothing is eligible", () => {
  const [s] = computeVendorStats([e({ category: "DUPLICATE" })]);
  assert.equal(s.eligible, 0);
  assert.equal(s.matchRate, null);
});

test("suppliers sort lowest rate first; latest supplier name is used", () => {
  const list = computeVendorStats([
    e({ supplierGstin: "A", supplierName: "Old Name", completedAt: new Date("2026-01-01") }),
    e({ supplierGstin: "A", supplierName: "New Name", completedAt: new Date("2026-06-01") }),
    e({ supplierGstin: "B", category: "MISSING_IN_2B", reviewStatus: "PENDING", needsReview: true }),
  ]);
  assert.deepEqual(list.map((s) => s.supplierGstin), ["B", "A"]);
  assert.equal(list[1].supplierName, "New Name");
});

test("email draft lists the real invoices and makes no claims about the supplier", () => {
  const { subject, body } = draftSupplierEmail({
    supplierName: "Tara Packaging", supplierGstin: "08AABCT2222B1Z0", buyerName: "Test Traders", buyerGstin: "08ABCDE1234F1Z0",
    periodLabel: "April 2026", senderName: "Lakshya Pandey",
    items: [
      { invoiceNo: "TP-2026-0480", invoiceDate: "2026-04-22", taxable: 2000000, tax: 360000, issue: "MISSING_IN_2B" },
      { invoiceNo: "TP-2026-0470", invoiceDate: "2026-04-20", taxable: 2000000, tax: 360000, issue: "VALUE_DIFF", gstr2bTax: 300000 },
    ],
  });
  assert.match(subject, /Test Traders.*April 2026/);
  assert.match(body, /TP-2026-0480 dated 22-04-2026 — taxable value ₹20,000.00, tax ₹3,600.00/);
  assert.match(body, /as per GSTR-2B ₹3,000.00/);
  assert.match(body, /On behalf of Test Traders/);
  assert.doesNotMatch(body, /fraud|non-complian|penalt/i);
});
