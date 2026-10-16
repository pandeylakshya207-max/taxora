"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import type { AmountDiffs, ReconSummary } from "@/lib/recon/engine";
import { callStructured } from "./client";
import { FAILURE_MESSAGE } from "./parse";
import {
  buildReconPrompt,
  buildResultPrompt,
  reconSummarySchema,
  reconSummaryTool,
  resultExplanationSchema,
  resultExplanationTool,
  type ResultSide,
} from "./prompts";

/** At most this many AI calls per workspace per minute. */
const PER_MINUTE = 10;

async function rateLimited(firmId: string) {
  const recent = await db.aiInsight.count({ where: { firmId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  return recent >= PER_MINUTE;
}

const toSide = (r: { invoiceNo: string; invoiceDate: string | null; docType: string; taxable: bigint; igst: bigint; cgst: bigint; sgst: bigint; cess: bigint }): ResultSide => ({
  invoiceNo: r.invoiceNo,
  invoiceDate: r.invoiceDate,
  docType: r.docType,
  taxable: Number(r.taxable),
  igst: Number(r.igst),
  cgst: Number(r.cgst),
  sgst: Number(r.sgst),
  cess: Number(r.cess),
});

const rowSelect = { id: true, invoiceNo: true, invoiceDate: true, docType: true, taxable: true, igst: true, cgst: true, sgst: true, cess: true } as const;

export async function explainResult(formData: FormData): Promise<void> {
  const session = await requireSession();
  const resultId = String(formData.get("resultId") ?? "");
  const back = String(formData.get("back") ?? "");
  const safeBack = back.startsWith("/reconciliation/") ? back : "/reconciliation";
  const fail = (msg: string): never => redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}aiError=${encodeURIComponent(msg)}`);

  // Authorisation first: the result must belong to this workspace.
  const result = await db.matchResult.findFirst({
    where: { id: resultId, firmId: session.firm.id },
    select: { id: true, category: true, flags: true, reasons: true, prRowId: true, b2bRowId: true },
  });
  if (!result) return fail("Result not found.");
  if (await rateLimited(session.firm.id)) return fail(FAILURE_MESSAGE.rate_limited);

  const ids = [result.prRowId, result.b2bRowId].filter((x): x is string => !!x);
  const rows = await db.invoiceRow.findMany({ where: { id: { in: ids }, firmId: session.firm.id }, select: rowSelect });
  const pr = rows.find((r) => r.id === result.prRowId);
  const b = rows.find((r) => r.id === result.b2bRowId);

  const out = await callStructured({
    prompt: buildResultPrompt({
      category: result.category,
      flags: result.flags,
      reasons: result.reasons,
      books: pr ? toSide(pr) : null,
      gstr2b: b ? toSide(b) : null,
    }),
    tool: resultExplanationTool,
    schema: resultExplanationSchema,
  });
  if (!out.ok) return fail(FAILURE_MESSAGE[out.reason]);

  await db.$transaction([
    db.aiInsight.create({
      data: { firmId: session.firm.id, scope: "result", targetId: result.id, model: out.model, output: out.data, createdById: session.user.id },
    }),
    db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "ai.explained", entityType: "MatchResult", entityId: result.id, details: { model: out.model } }),
    }),
  ]);
  redirect(safeBack);
}

export async function summarizeReconciliation(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("reconciliationId") ?? "");
  const back = `/reconciliation/${id}/finalise`;
  const fail = (msg: string): never => redirect(`${back}?aiError=${encodeURIComponent(msg)}`);

  const recon = await db.reconciliation.findFirst({
    where: { id, firmId: session.firm.id, status: "COMPLETED" },
    select: { id: true, summary: true },
  });
  if (!recon) return fail("Reconciliation not found.");
  if (await rateLimited(session.firm.id)) return fail(FAILURE_MESSAGE.rate_limited);

  const summary = recon.summary as unknown as ReconSummary;
  const [pending, open] = await Promise.all([
    db.matchResult.count({ where: { reconciliationId: id, firmId: session.firm.id, needsReview: true, reviewStatus: "PENDING" } }),
    db.matchResult.findMany({
      where: { reconciliationId: id, firmId: session.firm.id, needsReview: true, reviewStatus: { not: "REJECTED" } },
      select: { category: true, flags: true, diffs: true, prRowId: true, b2bRowId: true },
      take: 5000,
    }),
  ]);
  const rowIds = open.flatMap((o) => [o.prRowId, o.b2bRowId]).filter((x): x is string => !!x);
  const taxes = new Map(
    (await db.invoiceRow.findMany({ where: { id: { in: rowIds }, firmId: session.firm.id }, select: { id: true, igst: true, cgst: true, sgst: true, cess: true } })).map(
      (r) => [r.id, Number(r.igst + r.cgst + r.sgst + r.cess)],
    ),
  );
  const largest = open
    .map((o) => {
      const d = o.diffs as unknown as AmountDiffs | null;
      const tax = taxes.get(o.prRowId ?? "") ?? taxes.get(o.b2bRowId ?? "") ?? null;
      return { category: o.category, flags: o.flags, diffTotal: d?.total ?? null, tax, weight: Math.abs(d?.total ?? tax ?? 0) };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(({ weight: _w, ...rest }) => rest);

  const out = await callStructured({
    prompt: buildReconPrompt({
      totals: { books: summary.prRecords, gstr2b: summary.gstr2bRecords },
      byCategory: summary.byCategory,
      byFlag: summary.byFlag,
      pendingReview: pending,
      largest,
    }),
    tool: reconSummaryTool,
    schema: reconSummarySchema,
  });
  if (!out.ok) return fail(FAILURE_MESSAGE[out.reason]);

  await db.$transaction([
    db.aiInsight.create({
      data: { firmId: session.firm.id, scope: "reconciliation", targetId: id, model: out.model, output: out.data, createdById: session.user.id },
    }),
    db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "ai.summarized", entityType: "Reconciliation", entityId: id, details: { model: out.model } }),
    }),
  ]);
  redirect(back);
}
