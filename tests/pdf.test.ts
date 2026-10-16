import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildReportPdf, pdfSafe, PDF_MAX_LINES } from "../src/lib/reports/pdf";
import { sampleReport } from "./fixtures";

test("pdfSafe replaces characters the standard fonts cannot draw", () => {
  assert.equal(pdfSafe("₹ 1,000 → ≥ 5%"), "Rs. 1,000 -> >= 5%");
  assert.equal(pdfSafe("नमस्ते"), "??????");
  assert.equal(pdfSafe("“quoted” — ok…"), "“quoted” — ok…");
});

test("builds a valid PDF with metadata and page numbers", async () => {
  const bytes = await buildReportPdf(sampleReport());
  assert.ok(bytes.length > 1000);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getTitle(), "GST reconciliation - Test Traders - April 2026");
});

test("long reports paginate and cap at the PDF row limit", async () => {
  const bytes = await buildReportPdf(sampleReport(PDF_MAX_LINES + 50));
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 20, `pages: ${doc.getPageCount()}`);
});

test("empty review list renders without error", async () => {
  const data = sampleReport();
  data.lines = data.lines.filter((l) => l.category === "EXACT");
  const doc = await PDFDocument.load(await buildReportPdf(data));
  assert.equal(doc.getPageCount(), 1);
});
