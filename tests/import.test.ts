import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecords, checkMapping, detectHeader, detectMapping, type Row } from "../src/lib/recon/import";
import { reconcile } from "../src/lib/recon/engine";

// Synthetic GSTINs with valid check digits (not real businesses).
const G1 = "08ABCDE1234F1Z0";
const G2 = "27PQRST5678K1Z2";

test("detectMapping recognises common purchase-register headers", () => {
  const m = detectMapping(["Sr", "Party GSTIN", "Party Name", "Bill No.", "Bill Date", "Taxable Amount (Rs)", "CGST Amt", "SGST Amt", "IGST Amt", "Cess", "Grand Total"]);
  assert.equal(m.gstin, 1);
  assert.equal(m.supplierName, 2);
  assert.equal(m.invoiceNo, 3);
  assert.equal(m.invoiceDate, 4);
  assert.equal(m.taxable, 5);
  assert.equal(m.cgst, 6);
  assert.equal(m.sgst, 7);
  assert.equal(m.igst, 8);
  assert.equal(m.cess, 9);
  assert.equal(m.total, 10);
  assert.deepEqual(checkMapping(m), []);
});

test("detectHeader finds a two-row GSTR-2B style header below title rows", () => {
  const rows: Row[] = [
    ["Goods and Services Tax - GSTR-2B"],
    ["Taxable inward supplies received from registered persons"],
    [],
    ["GSTIN of supplier", "Trade/Legal name", "Invoice details", "", "", "", "Place of supply", "Supply Attract Reverse Charge", "Taxable Value (₹)", "Tax Amount", "", "", ""],
    ["", "", "Invoice number", "Invoice type", "Invoice Date", "Invoice Value(₹)", "", "", "", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)", "Cess(₹)"],
    [G1, "Sample Traders", "INV-1001", "Regular", "05-04-2026", "118000", "Rajasthan", "No", "100000", "", "9000", "9000", ""],
  ];
  const h = detectHeader(rows);
  assert.ok(h);
  assert.equal(h.headerRowIndex, 3);
  assert.equal(h.dataStartIndex, 5);
  const m = detectMapping(h.headers);
  assert.equal(m.gstin, 0);
  assert.equal(m.invoiceNo, 2);
  assert.equal(m.docType, 3);
  assert.equal(m.invoiceDate, 4);
  assert.equal(m.total, 5);
  assert.equal(m.taxable, 8);
  assert.equal(m.igst, 9);
  assert.equal(m.cgst, 10);
  assert.equal(m.sgst, 11);
  assert.equal(m.cess, 12);
  assert.deepEqual(checkMapping(m), []);

  const result = buildRecords(rows, h.dataStartIndex, m, "b");
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 1);
  const r = result.records[0];
  assert.equal(r.taxable, 10000000);
  assert.equal(r.cgst, 900000);
  assert.equal(r.igst, 0); // blank cell in a mapped tax column = no IGST
  assert.equal(r.invoiceDate, "2026-04-05");
  assert.equal(r.sourceRow, 6); // what the user sees in Excel
  assert.equal(r.original.invoiceNo, "INV-1001");
});

test("checkMapping blocks missing required columns and reused columns", () => {
  const m = detectMapping(["GSTIN", "Invoice No", "Taxable Value"]);
  const problems = checkMapping(m).map((p) => p.message);
  assert.ok(problems.some((p) => p.includes("Invoice date")));
  assert.ok(problems.some((p) => p.includes("No tax column")));

  const m2 = { ...detectMapping(["GSTIN", "Invoice No", "Date", "Taxable", "CGST"]), sgst: 4 };
  assert.ok(checkMapping(m2).some((p) => p.message.includes("same column")));
});

test("buildRecords reports every bad row with row number and reason, and drops nothing silently", () => {
  const rows: Row[] = [
    ["GSTIN", "Invoice No", "Invoice Date", "Taxable Value", "CGST", "SGST"],
    [G1, "A-1", "05-04-2026", "1,00,000.00", "9000", "9000"], // ok
    [G1, "", "05-04-2026", "100", "9", "9"], // missing invoice no
    ["08ABCDE1234F1Z1", "A-3", "05-04-2026", "100", "9", "9"], // bad GSTIN check digit
    [G1, "A-4", "31-02-2026", "100", "9", "9"], // impossible date
    [G1, "A-5", "05-04-2026", "ten", "9", "9"], // taxable not a number
    [G1, "A-6", "05-04-2026", "100", "nine", "9"], // CGST not a number
    [],
    ["", "", "Total", "100500", "9036", "9036"], // totals row
  ];
  const m = detectMapping(rows[0].map(String));
  const res = buildRecords(rows, 1, m, "p");
  assert.equal(res.stats.dataRows, 8);
  assert.equal(res.stats.valid, 1);
  assert.equal(res.stats.withErrors, 5);
  assert.equal(res.stats.blank, 1);
  assert.equal(res.warnings.filter((w) => w.message.includes("totals row")).length, 1);
  // valid + errored + blank + totals = all data rows
  assert.equal(res.stats.valid + res.stats.withErrors + res.stats.blank + 1, res.stats.dataRows);

  const byRow = (n: number) => res.errors.filter((e) => e.row === n);
  assert.equal(byRow(3)[0].field, "invoiceNo");
  assert.equal(byRow(4)[0].field, "gstin");
  assert.ok(byRow(4)[0].message.includes("check digit"));
  assert.equal(byRow(5)[0].field, "invoiceDate");
  assert.equal(byRow(6)[0].field, "taxable");
  assert.equal(byRow(7)[0].field, "cgst");
});

test("Document types are read, with credit notes recognised", () => {
  const rows: Row[] = [
    ["GSTIN", "Note No", "Note Date", "Note Type", "Taxable Value", "IGST"],
    [G2, "CN-1", "10-04-2026", "Credit Note", "-5000", "-900"],
    [G2, "DN-1", "10-04-2026", "Debit note", "2000", "360"],
    [G2, "X-1", "10-04-2026", "Something else", "2000", "360"],
  ];
  const res = buildRecords(rows, 1, detectMapping(rows[0].map(String)), "b");
  assert.equal(res.records[0].docType, "CREDIT_NOTE");
  assert.equal(res.records[0].taxable, -500000);
  assert.equal(res.records[1].docType, "DEBIT_NOTE");
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].field, "docType");
});

test("Warnings: stated invoice value disagrees with components; duplicates; negatives without doc type", () => {
  const rows: Row[] = [
    ["GSTIN", "Invoice No", "Date", "Taxable", "CGST", "SGST", "Invoice Value"],
    [G1, "A-1", "05-04-2026", "1000", "90", "90", "1200"], // computed 1180
    [G1, "A-2", "05-04-2026", "1000", "90", "90", "1180"],
    [G1, "a/2", "06-04-2026", "1000", "90", "90", "1180"], // duplicate key of A-2
    [G1, "A-3", "05-04-2026", "-500", "-45", "-45", ""],
  ];
  const res = buildRecords(rows, 1, detectMapping(rows[0].map(String)), "p");
  assert.equal(res.errors.length, 0);
  assert.ok(res.warnings.some((w) => w.row === 2 && w.field === "total"));
  assert.ok(res.warnings.some((w) => w.message.includes("appear more than once")));
  assert.ok(res.warnings.some((w) => w.message.includes("negative values")));
  assert.equal(res.stats.duplicateKeys, 1);
});

test("Excel serial dates and numeric cells are handled", () => {
  const rows: Row[] = [
    ["GSTIN", "Invoice No", "Invoice Date", "Taxable Value", "IGST"],
    [G1, 1001, 46117, 100000.5, 18000.09],
  ];
  const res = buildRecords(rows, 1, detectMapping(rows[0].map(String)), "p");
  assert.equal(res.errors.length, 0);
  assert.equal(res.records[0].invoiceNo, "1001");
  assert.equal(res.records[0].invoiceDate, "2026-04-05");
  assert.equal(res.records[0].taxable, 10000050);
  assert.equal(res.records[0].igst, 1800009);
});

test("End to end: two differently formatted files reconcile", () => {
  const pr: Row[] = [
    ["Party GSTIN", "Bill No.", "Bill Date", "Taxable Amount", "CGST Amt", "SGST Amt"],
    [G1, "INV/1001", "05/04/2026", "100000", "9000", "9000"],
    [G1, "INV/1002", "06/04/2026", "50000", "4500", "4500"],
  ];
  const b2b: Row[] = [
    ["GSTIN of supplier", "Invoice number", "Invoice Date", "Taxable Value (₹)", "Central Tax(₹)", "State/UT Tax(₹)"],
    [G1, "inv-1001", "2026-04-05", "100000.00", "9000.00", "9000.00"],
    [G1, "INV-1003", "07-04-2026", "20000", "1800", "1800"],
  ];
  const p = buildRecords(pr, 1, detectMapping(pr[0].map(String)), "pr:");
  const b = buildRecords(b2b, 1, detectMapping(b2b[0].map(String)), "2b:");
  const res = reconcile(p.records, b.records);
  assert.equal(res.find((r) => r.prId === "pr:2")?.category, "EXACT");
  assert.equal(res.find((r) => r.prId === "pr:3")?.category, "MISSING_IN_2B");
  assert.equal(res.find((r) => r.gstr2bId === "2b:3")?.category, "MISSING_IN_PR");
});
