/**
 * Everything an export needs, loaded once from the database for exactly the
 * selected workspace, reconciliation and filters. The Excel and PDF builders
 * are pure functions of this data — they never query anything themselves.
 */

import type { Paise } from "../recon/money";

export type ReportSide = {
  sourceRow: number;
  gstin: string;
  supplierName: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  docType: string;
  taxable: Paise;
  igst: Paise;
  cgst: Paise;
  sgst: Paise;
  cess: Paise;
};

export type ReportLine = {
  category: string;
  flags: string[];
  reason: string;
  needsReview: boolean;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewNote: string | null;
  score: number | null;
  pr: ReportSide | null;
  b2b: ReportSide | null;
  diffTotal: Paise | null;
  diffTaxable: Paise | null;
  diffTax: Paise | null;
};

export type ImportIssue = { source: string; row: number; field: string; message: string; value: string };

export type ReportData = {
  workspaceName: string;
  client: { name: string; gstin: string | null };
  period: string; // "YYYY-MM"
  periodLabel: string; // "April 2026"
  generatedAt: Date;
  generatedBy: string;
  completedAt: Date | null;
  finalizedAt: Date | null;
  finalizedBy: string | null;
  /** Human-readable description of the filter applied, or null for the full report. */
  filterLabel: string | null;
  counts: { prRecords: number; gstr2bRecords: number; byCategory: Record<string, number>; needsReview: number; pendingReview: number };
  lines: ReportLine[];
  importIssues: ImportIssue[];
  importIssueTotal: number;
};

export const sideTotal = (s: ReportSide | null): Paise | null =>
  s ? s.taxable + s.igst + s.cgst + s.sgst + s.cess : null;

export const sideTax = (s: ReportSide | null): Paise | null => (s ? s.igst + s.cgst + s.sgst + s.cess : null);

export const REPORT_DISCLAIMER =
  "This report compares the purchase register with GSTR-2B as uploaded. Matches are evidence for professional review; " +
  "they are not a determination of input tax credit eligibility. Taxora does not file returns or transmit data to the GST portal.";
