import type { ReportData, ReportLine, ReportSide } from "../src/lib/reports/types";

const side = (p: Partial<ReportSide> & { invoiceNo: string }): ReportSide => ({
  sourceRow: 2, gstin: "08AAACS1111A1ZA", supplierName: "Shree Steel Pvt Ltd", invoiceDate: "2026-04-05",
  docType: "INVOICE", taxable: 10000000, igst: 0, cgst: 900000, sgst: 900000, cess: 0, ...p,
});

export function sampleReport(extraLines = 0): ReportData {
  const lines: ReportLine[] = [
    { category: "EXACT", flags: [], reason: "All agree.", needsReview: false, reviewStatus: "ACCEPTED", reviewNote: null, score: 100,
      pr: side({ invoiceNo: "SS/26-27/101" }), b2b: side({ invoiceNo: "SS/26-27/101" }), diffTotal: 0, diffTaxable: 0, diffTax: 0 },
    { category: "FUZZY", flags: ["TAXABLE_DIFF", "TAX_DIFF"], reason: "Same GSTIN; invoice numbers 100% similar; total value differs by 0.99%.",
      needsReview: true, reviewStatus: "PENDING", reviewNote: null, score: 94.8,
      pr: side({ invoiceNo: "tp/2026/457", gstin: "08AABCT2222B1Z0", supplierName: "Tara Packaging", taxable: 5000000, cgst: 450000, sgst: 450000 }),
      b2b: side({ invoiceNo: "TP-2026-0457", gstin: "08AABCT2222B1Z0", supplierName: "Tara Packaging", taxable: 5050000, cgst: 454500, sgst: 454500 }),
      diffTotal: -59000, diffTaxable: -50000, diffTax: -9000 },
    { category: "MISSING_IN_2B", flags: [], reason: "No matching record was found in GSTR-2B for this purchase-register entry.",
      needsReview: true, reviewStatus: "REJECTED", reviewNote: "Supplier to file in next return", score: null,
      pr: side({ invoiceNo: "ML/APR/901", gstin: "27AAECM3333C1ZW", supplierName: "Mehta Logistics — “Mumbai” ₹", cgst: 0, sgst: 0, igst: 216000, taxable: 1200000 }),
      b2b: null, diffTotal: null, diffTaxable: null, diffTax: null },
  ];
  for (let i = 0; i < extraLines; i++) {
    lines.push({ ...lines[1], pr: { ...lines[1].pr!, invoiceNo: `INV-${i}` } });
  }
  return {
    workspaceName: "Pandey & Associates",
    client: { name: "Test Traders", gstin: "08ABCDE1234F1Z0" },
    period: "2026-04",
    periodLabel: "April 2026",
    generatedAt: new Date("2026-10-17T06:30:00Z"),
    generatedBy: "Lakshya Pandey",
    completedAt: new Date("2026-10-17T06:00:00Z"),
    finalizedAt: null,
    finalizedBy: null,
    filterLabel: null,
    counts: { prRecords: 7, gstr2bRecords: 6, needsReview: 7 + extraLines, pendingReview: 5,
      byCategory: { EXACT: 1, FUZZY: 2 + extraLines, PROBABLE: 1, GSTIN_MISMATCH: 1, MISSING_IN_2B: 1, MISSING_IN_PR: 1, DUPLICATE: 1 } },
    lines,
    importIssues: [{ source: "Purchase register", row: 9, field: "Supplier GSTIN", message: "GSTIN check digit does not match — check for a typo.", value: "08AAACS1111A1ZX" }],
    importIssueTotal: 2,
  };
}
