import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReconPrompt, buildResultPrompt, resultExplanationSchema, reconSummarySchema, SYSTEM_PROMPT } from "../src/lib/ai/prompts";
import { extractToolInput, failureForStatus } from "../src/lib/ai/parse";

const side = { invoiceNo: "TP-2026-0457", invoiceDate: "2026-04-08", docType: "INVOICE", taxable: 5000000, igst: 0, cgst: 450000, sgst: 450000, cess: 0 };

test("result prompt contains amounts and invoice numbers but no GSTIN or names", () => {
  const prompt = buildResultPrompt({
    category: "FUZZY",
    flags: ["TAXABLE_DIFF"],
    reasons: ["Same GSTIN; invoice numbers 100% similar; total value differs by 0.99%."],
    books: side,
    gstr2b: { ...side, invoiceNo: "TP/2026/457", taxable: 5050000 },
  });
  assert.match(prompt, /TP-2026-0457/);
  assert.match(prompt, /Rs 50,500.00/);
  assert.doesNotMatch(prompt, /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/, "no GSTIN pattern");
  assert.doesNotMatch(prompt, /Tara|Traders|Pandey/i);
});

test("system prompt forbids eligibility conclusions and accusations", () => {
  assert.match(SYSTEM_PROMPT, /Do not state that input tax credit is eligible or ineligible/);
  assert.match(SYSTEM_PROMPT, /Do not speculate about supplier misconduct or fraud/);
});

test("reconciliation prompt is aggregate-only", () => {
  const p = buildReconPrompt({
    totals: { books: 7, gstr2b: 6 },
    byCategory: { EXACT: 1, MISSING_IN_2B: 1 },
    byFlag: { TAX_DIFF: 2, AMBIGUOUS: 0 },
    pendingReview: 4,
    largest: [{ category: "MISSING_IN_2B", flags: [], diffTotal: null, tax: 216000 }],
  });
  assert.match(p, /TAX_DIFF 2/);
  assert.doesNotMatch(p, /AMBIGUOUS/); // zero counts omitted
  assert.match(p, /Rs 2,160.00/);
});

const good = {
  summary: "The books record a slightly lower taxable value than GSTR-2B for what appears to be the same invoice.",
  likely_causes: [{ cause: "Freight added on the invoice but not booked", likelihood: "medium" }],
  suggested_checks: ["Compare the physical invoice with the purchase entry."],
};

test("valid tool output is accepted", () => {
  const r = extractToolInput({ content: [{ type: "text", text: "ok" }, { type: "tool_use", name: "record_explanation", input: good }] }, "record_explanation", resultExplanationSchema);
  assert.equal(r.ok, true);
});

test("free text, wrong tool, or schema violations are all discarded", () => {
  const cases = [
    { content: [{ type: "text", text: JSON.stringify(good) }] },
    { content: [{ type: "tool_use", name: "other_tool", input: good }] },
    { content: [{ type: "tool_use", name: "record_explanation", input: { ...good, likely_causes: [{ cause: "x", likelihood: "certain" }] } }] },
    { content: [{ type: "tool_use", name: "record_explanation", input: { ...good, suggested_checks: [] } }] },
    { content: [{ type: "tool_use", name: "record_explanation", input: { ...good, summary: "x".repeat(5000) } }] },
    null,
    "garbage",
  ];
  for (const c of cases) assert.equal(extractToolInput(c, "record_explanation", resultExplanationSchema).ok, false);
  assert.equal(extractToolInput({ content: [{ type: "tool_use", name: "record_summary", input: { overview: "short", priorities: [] } }] }, "record_summary", reconSummarySchema).ok, false);
});

test("provider status codes map to honest reasons", () => {
  assert.equal(failureForStatus(429), "rate_limited");
  assert.equal(failureForStatus(529), "rate_limited");
  assert.equal(failureForStatus(500), "provider_error");
  assert.equal(failureForStatus(401), "provider_error");
});
