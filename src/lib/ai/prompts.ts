/**
 * Prompts and output schemas for AI assistance.
 *
 * DATA MINIMISATION: prompts contain only what an explanation needs —
 * category, flags, invoice numbers, dates, document types and amounts.
 * GSTINs, supplier names, client names and user details are never included.
 *
 * Every model response is validated against a schema before it is stored or
 * shown. Anything that does not validate is discarded.
 */

import { z } from "zod";
import { formatPaise } from "../recon/money";

export const SYSTEM_PROMPT = [
  "You assist Indian chartered accountants reviewing a GST reconciliation between a client's purchase register (the books) and GSTR-2B.",
  "Explain discrepancies in plain, precise language using only the data provided.",
  "Do not state that input tax credit is eligible or ineligible, do not give legal conclusions, and do not cite specific sections, rules, notifications or due dates.",
  "Do not speculate about supplier misconduct or fraud. Present causes as possibilities to check, not facts.",
  "Always respond by calling the provided tool exactly once.",
].join(" ");

// ───────── Single result ─────────

export type ResultSide = {
  invoiceNo: string;
  invoiceDate: string | null;
  docType: string;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
};

export type ResultPromptInput = {
  category: string;
  flags: string[];
  reasons: string[];
  books: ResultSide | null;
  gstr2b: ResultSide | null;
};

const side = (label: string, s: ResultSide | null) =>
  s
    ? `${label}: invoice ${s.invoiceNo}, date ${s.invoiceDate ?? "not recorded"}, type ${s.docType}, taxable Rs ${formatPaise(s.taxable)}, IGST Rs ${formatPaise(s.igst)}, CGST Rs ${formatPaise(s.cgst)}, SGST Rs ${formatPaise(s.sgst)}, cess Rs ${formatPaise(s.cess)}`
    : `${label}: no matching record`;

export function buildResultPrompt(input: ResultPromptInput): string {
  return [
    `Classification by the matching engine: ${input.category}.`,
    input.flags.length ? `Flags: ${input.flags.join(", ")}.` : "Flags: none.",
    `Engine's reasons: ${input.reasons.join(" ")}`,
    side("Purchase register", input.books),
    side("GSTR-2B", input.gstr2b),
    "Explain what the difference most likely means and what the reviewer should check next.",
  ].join("\n");
}

export const resultExplanationSchema = z.object({
  summary: z.string().min(10).max(600),
  likely_causes: z
    .array(z.object({ cause: z.string().min(3).max(240), likelihood: z.enum(["high", "medium", "low"]) }))
    .min(1)
    .max(4),
  suggested_checks: z.array(z.string().min(3).max(240)).min(1).max(5),
});
export type ResultExplanation = z.infer<typeof resultExplanationSchema>;

export const resultExplanationTool = {
  name: "record_explanation",
  description: "Record a plain-language explanation of one reconciliation result.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2–3 sentences: what the difference means." },
      likely_causes: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: { cause: { type: "string" }, likelihood: { type: "string", enum: ["high", "medium", "low"] } },
          required: ["cause", "likelihood"],
        },
      },
      suggested_checks: { type: "array", maxItems: 5, items: { type: "string" } },
    },
    required: ["summary", "likely_causes", "suggested_checks"],
  },
} as const;

// ───────── Whole reconciliation ─────────

export type ReconPromptInput = {
  totals: { books: number; gstr2b: number };
  byCategory: Record<string, number>;
  byFlag: Record<string, number>;
  pendingReview: number;
  /** Largest absolute differences: amounts and categories only. */
  largest: { category: string; flags: string[]; diffTotal: number | null; tax: number | null }[];
};

export function buildReconPrompt(input: ReconPromptInput): string {
  const lines = [
    `Records: ${input.totals.books} in the purchase register, ${input.totals.gstr2b} in GSTR-2B.`,
    `Results by category: ${Object.entries(input.byCategory).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Flags: ${Object.entries(input.byFlag).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
    `Results still pending review: ${input.pendingReview}.`,
    "Largest items needing attention (category, flags, difference, tax):",
    ...input.largest.map(
      (l, i) =>
        `${i + 1}. ${l.category}${l.flags.length ? ` [${l.flags.join(", ")}]` : ""}, difference ${l.diffTotal === null ? "n/a" : `Rs ${formatPaise(l.diffTotal)}`}, tax ${l.tax === null ? "n/a" : `Rs ${formatPaise(l.tax)}`}`,
    ),
    "Summarise the overall position and suggest how the reviewer should prioritise the remaining work.",
  ];
  return lines.join("\n");
}

export const reconSummarySchema = z.object({
  overview: z.string().min(10).max(800),
  priorities: z
    .array(z.object({ title: z.string().min(3).max(120), why: z.string().min(3).max(300) }))
    .min(1)
    .max(5),
});
export type ReconSummaryAi = z.infer<typeof reconSummarySchema>;

export const reconSummaryTool = {
  name: "record_summary",
  description: "Record an overview of a reconciliation and the review priorities.",
  input_schema: {
    type: "object",
    properties: {
      overview: { type: "string", description: "3–5 sentences on the overall position." },
      priorities: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: { title: { type: "string" }, why: { type: "string" } },
          required: ["title", "why"],
        },
      },
    },
    required: ["overview", "priorities"],
  },
} as const;
