import ExcelJS from "exceljs";
import { CATEGORY_INFO, CATEGORY_ORDER, FLAG_LABEL, REVIEW_LABEL, isCategory } from "../recon/labels";
import { REPORT_DISCLAIMER, sideTotal, type ReportData, type ReportLine } from "./types";

/**
 * Builds the Excel reconciliation report. Pure: data in, bytes out.
 * Amounts are written as numbers in rupees (paise / 100) so Excel can sum and
 * filter them; text from uploaded files is always written as text, never as a
 * formula, so a cell like "=HYPERLINK(...)" in a supplier name stays harmless.
 */

const NAVY = "FF0A1228";
const SURFACE = "FFF8FAFC";
const MONEY = "#,##0.00;[Red]-#,##0.00";
const DATE = "dd-mm-yyyy";

const rupees = (paise: number | null | undefined) => (paise === null || paise === undefined ? null : paise / 100);
const isoToDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

type DetailCol = { header: string; key: string; width: number; money?: boolean; date?: boolean };

const DETAIL_COLS: DetailCol[] = [
  { header: "Result", key: "result", width: 16 },
  { header: "Flags", key: "flags", width: 28 },
  { header: "Reason", key: "reason", width: 60 },
  { header: "Review status", key: "review", width: 15 },
  { header: "Review note", key: "note", width: 30 },
  { header: "Supplier GSTIN", key: "gstin", width: 18 },
  { header: "Supplier name", key: "supplier", width: 26 },
  { header: "PR row", key: "prRow", width: 8 },
  { header: "PR invoice no.", key: "prNo", width: 18 },
  { header: "PR date", key: "prDate", width: 12, date: true },
  { header: "PR taxable", key: "prTaxable", width: 14, money: true },
  { header: "PR IGST", key: "prIgst", width: 12, money: true },
  { header: "PR CGST", key: "prCgst", width: 12, money: true },
  { header: "PR SGST", key: "prSgst", width: 12, money: true },
  { header: "PR cess", key: "prCess", width: 10, money: true },
  { header: "PR total", key: "prTotal", width: 14, money: true },
  { header: "2B row", key: "bRow", width: 8 },
  { header: "2B invoice no.", key: "bNo", width: 18 },
  { header: "2B date", key: "bDate", width: 12, date: true },
  { header: "2B taxable", key: "bTaxable", width: 14, money: true },
  { header: "2B IGST", key: "bIgst", width: 12, money: true },
  { header: "2B CGST", key: "bCgst", width: 12, money: true },
  { header: "2B SGST", key: "bSgst", width: 12, money: true },
  { header: "2B cess", key: "bCess", width: 10, money: true },
  { header: "2B total", key: "bTotal", width: 14, money: true },
  { header: "Diff taxable (PR − 2B)", key: "dTaxable", width: 16, money: true },
  { header: "Diff tax (PR − 2B)", key: "dTax", width: 15, money: true },
  { header: "Diff total (PR − 2B)", key: "dTotal", width: 16, money: true },
  { header: "Score", key: "score", width: 8 },
];

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
}

function lineToRow(l: ReportLine) {
  const p = l.pr;
  const b = l.b2b;
  return {
    result: isCategory(l.category) ? CATEGORY_INFO[l.category].label : l.category,
    flags: l.flags.map((f) => FLAG_LABEL[f] ?? f).join(", "),
    reason: l.reason,
    review: l.needsReview ? REVIEW_LABEL[l.reviewStatus] : "Not needed",
    note: l.reviewNote ?? "",
    gstin: (p ?? b)?.gstin ?? "",
    supplier: (p ?? b)?.supplierName ?? "",
    prRow: p?.sourceRow ?? null,
    prNo: p?.invoiceNo ?? "",
    prDate: isoToDate(p?.invoiceDate ?? null),
    prTaxable: rupees(p?.taxable),
    prIgst: rupees(p?.igst),
    prCgst: rupees(p?.cgst),
    prSgst: rupees(p?.sgst),
    prCess: rupees(p?.cess),
    prTotal: rupees(sideTotal(p)),
    bRow: b?.sourceRow ?? null,
    bNo: b?.invoiceNo ?? "",
    bDate: isoToDate(b?.invoiceDate ?? null),
    bTaxable: rupees(b?.taxable),
    bIgst: rupees(b?.igst),
    bCgst: rupees(b?.cgst),
    bSgst: rupees(b?.sgst),
    bCess: rupees(b?.cess),
    bTotal: rupees(sideTotal(b)),
    dTaxable: rupees(l.diffTaxable),
    dTax: rupees(l.diffTax),
    dTotal: rupees(l.diffTotal),
    score: l.score,
  };
}

function addDetailSheet(wb: ExcelJS.Workbook, name: string, lines: ReportLine[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  ws.columns = DETAIL_COLS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.money ? { numFmt: MONEY } : c.date ? { numFmt: DATE } : {},
  }));
  styleHeader(ws.getRow(1));

  if (lines.length === 0) {
    ws.addRow({ result: "No records in this category." });
    return;
  }
  for (const l of lines) ws.addRow(lineToRow(l));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + lines.length, column: DETAIL_COLS.length } };

  // Totals row: real SUM formulas, with the cached result computed exactly from paise.
  const last = 1 + lines.length;
  const totals = ws.addRow({ result: "Total" });
  totals.font = { bold: true };
  totals.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SURFACE } };
  DETAIL_COLS.forEach((c, i) => {
    if (!c.money) return;
    const letter = ws.getColumn(i + 1).letter;
    const paise = lines.reduce((sum, l) => {
      const v = (lineToRow(l) as Record<string, unknown>)[c.key];
      return sum + (typeof v === "number" ? Math.round(v * 100) : 0);
    }, 0);
    totals.getCell(i + 1).value = { formula: `SUM(${letter}2:${letter}${last})`, result: paise / 100 };
  });
}

export async function buildReportWorkbook(data: ReportData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Taxora";
  wb.created = data.generatedAt;
  wb.title = `GST reconciliation - ${data.client.name} - ${data.periodLabel}`;

  // ── Executive Summary ──
  const s = wb.addWorksheet("Executive Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 34 }, { width: 22 }, { width: 70 }];
  const title = s.addRow(["Taxora — GST Reconciliation Report"]);
  title.font = { bold: true, size: 16, color: { argb: NAVY } };
  s.addRow([]);
  const meta: [string, string | Date][] = [
    ["Client", data.client.name],
    ["Client GSTIN", data.client.gstin ?? "Unregistered"],
    ["Tax period", data.periodLabel],
    ["Workspace", data.workspaceName],
    ["Generated", data.generatedAt],
    ["Generated by", data.generatedBy],
    ["Status", data.finalizedAt ? `Finalised${data.finalizedBy ? ` by ${data.finalizedBy}` : ""}` : "Not finalised (draft review)"],
  ];
  if (data.filterLabel) meta.push(["Filter applied", data.filterLabel]);
  for (const [k, v] of meta) {
    const r = s.addRow([k, v]);
    r.getCell(1).font = { color: { argb: "FF64748B" } };
    r.getCell(2).font = { bold: true };
    if (v instanceof Date) r.getCell(2).numFmt = "dd-mm-yyyy hh:mm";
  }
  s.addRow([]);
  const head = s.addRow(["Result", "Count", "What it means"]);
  styleHeader(head);
  head.height = 20;
  for (const c of CATEGORY_ORDER) {
    s.addRow([CATEGORY_INFO[c].label, data.counts.byCategory[c] ?? 0, CATEGORY_INFO[c].help]);
  }
  const tot = s.addRow(["Total results", CATEGORY_ORDER.reduce((a, c) => a + (data.counts.byCategory[c] ?? 0), 0), ""]);
  tot.font = { bold: true };
  s.addRow([]);
  s.addRow(["Purchase-register records", data.counts.prRecords]);
  s.addRow(["GSTR-2B records", data.counts.gstr2bRecords]);
  s.addRow(["Results needing review", data.counts.needsReview]);
  s.addRow(["Still pending review", data.counts.pendingReview]);
  s.addRow(["Uploaded rows excluded (errors)", data.importIssueTotal]);
  s.addRow([]);
  const disc = s.addRow([REPORT_DISCLAIMER]);
  s.mergeCells(disc.number, 1, disc.number, 3);
  disc.alignment = { wrapText: true, vertical: "top" };
  disc.height = 48;
  disc.font = { italic: true, color: { argb: "FF64748B" } };

  // ── Detail sheets ──
  const by = (cats: string[]) => data.lines.filter((l) => cats.includes(l.category));
  addDetailSheet(wb, "Matched", by(["EXACT", "FUZZY", "PROBABLE", "GSTIN_MISMATCH"]));
  addDetailSheet(wb, "Missing in GSTR-2B", by(["MISSING_IN_2B"]));
  addDetailSheet(wb, "Missing in Books", by(["MISSING_IN_PR"]));
  addDetailSheet(wb, "Needs Review", data.lines.filter((l) => l.needsReview && l.reviewStatus === "PENDING"));
  addDetailSheet(wb, "Duplicates", by(["DUPLICATE"]));

  // ── Import errors ──
  const e = wb.addWorksheet("Import Errors", { views: [{ state: "frozen", ySplit: 1 }] });
  e.columns = [
    { header: "File", key: "source", width: 20 },
    { header: "Excel row", key: "row", width: 10 },
    { header: "Column", key: "field", width: 18 },
    { header: "Problem", key: "message", width: 60 },
    { header: "Value in file", key: "value", width: 28 },
  ];
  styleHeader(e.getRow(1));
  if (data.importIssues.length === 0) {
    e.addRow({ source: "No rows were rejected." });
  } else {
    for (const i of data.importIssues) e.addRow(i);
    e.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + data.importIssues.length, column: 5 } };
    if (data.importIssueTotal > data.importIssues.length) {
      e.addRow({ source: `Showing ${data.importIssues.length} of ${data.importIssueTotal} rejected rows.` });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayBuffer);
}
