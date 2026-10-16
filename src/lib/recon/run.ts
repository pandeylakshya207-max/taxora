import "server-only";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { formatPeriod } from "./periods";
import type { SessionContext } from "@/lib/auth/session";
import { reconcile, summarize, type InvoiceRecord } from "./engine";
import { resolveReconConfig } from "./config";
import type { ImportStats } from "./store";

const INSERT_BATCH = 1000;

export type RunOutcome = { ok: true } | { ok: false; error: string };

/**
 * Run the engine for a draft reconciliation and store every result.
 *
 * Status only becomes COMPLETED inside the same transaction that writes the
 * results, so a reconciliation is never shown as complete without its data.
 * Before saving, the run checks that every imported row appears in exactly one
 * result; if not, nothing is saved and the run is marked FAILED.
 */
export async function runReconciliation(session: SessionContext, reconciliationId: string): Promise<RunOutcome> {
  const recon = await db.reconciliation.findFirst({
    where: { id: reconciliationId, firmId: session.firm.id },
    select: { id: true, status: true, period: true, client: { select: { name: true } }, files: { select: { source: true, stats: true } } },
  });
  if (!recon) return { ok: false, error: "Reconciliation not found." };
  if (recon.status === "COMPLETED") return { ok: false, error: "This reconciliation has already been run." };

  for (const source of ["PURCHASE_REGISTER", "GSTR2B"] as const) {
    const file = recon.files.find((f) => f.source === source);
    const stats = file?.stats as unknown as ImportStats | undefined;
    const label = source === "GSTR2B" ? "GSTR-2B" : "purchase register";
    if (!file || !stats) return { ok: false, error: `Upload the ${label} file first.` };
    if (stats.mappingProblems.length) return { ok: false, error: `Fix the columns of the ${label} file first.` };
    if (stats.valid === 0) return { ok: false, error: `The ${label} file has no valid rows.` };
  }

  const rows = await db.invoiceRow.findMany({
    where: { reconciliationId, firmId: session.firm.id },
    select: {
      id: true,
      source: true,
      gstin: true,
      supplierName: true,
      invoiceNo: true,
      invoiceDate: true,
      docType: true,
      taxable: true,
      igst: true,
      cgst: true,
      sgst: true,
      cess: true,
    },
    orderBy: { sourceRow: "asc" },
  });

  const toRecord = (r: (typeof rows)[number]): InvoiceRecord => ({
    id: r.id,
    gstin: r.gstin,
    supplierName: r.supplierName,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    docType: r.docType,
    taxable: Number(r.taxable),
    igst: Number(r.igst),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    cess: Number(r.cess),
  });
  const pr = rows.filter((r) => r.source === "PURCHASE_REGISTER").map(toRecord);
  const b2b = rows.filter((r) => r.source === "GSTR2B").map(toRecord);

  // The workspace's own thresholds, validated and clamped; saved with the run below.
  const firm = await db.firm.findUnique({ where: { id: session.firm.id }, select: { reconConfig: true } });
  const config = resolveReconConfig(firm?.reconConfig);

  try {
    const results = reconcile(pr, b2b, config);

    // Integrity check: every row exactly once, before anything is saved.
    const prSeen = results.flatMap((r) => (r.prId ? [r.prId] : []));
    const bSeen = results.flatMap((r) => (r.gstr2bId ? [r.gstr2bId] : []));
    if (prSeen.length !== pr.length || new Set(prSeen).size !== pr.length || bSeen.length !== b2b.length || new Set(bSeen).size !== b2b.length) {
      throw new Error(`Integrity check failed: PR ${prSeen.length}/${pr.length}, 2B ${bSeen.length}/${b2b.length}`);
    }

    const summary = summarize(pr.length, b2b.length, results);

    await db.$transaction(
      async (tx) => {
        await tx.matchResult.deleteMany({ where: { reconciliationId } });
        for (let i = 0; i < results.length; i += INSERT_BATCH) {
          await tx.matchResult.createMany({
            data: results.slice(i, i + INSERT_BATCH).map((r) => ({
              firmId: session.firm.id,
              reconciliationId,
              category: r.category,
              prRowId: r.prId,
              b2bRowId: r.gstr2bId,
              flags: r.flags,
              reasons: r.reasons,
              needsReview: r.needsReview,
              score: r.score ?? undefined,
              diffs: r.diffs ?? undefined,
              relatedIds: r.relatedIds,
              // Exact matches need no human decision; everything else starts pending.
              reviewStatus: r.needsReview ? "PENDING" : "ACCEPTED",
            })),
          });
        }
        await tx.reconciliation.update({
          where: { id: reconciliationId },
          data: { status: "COMPLETED", summary, config, completedAt: new Date(), error: null },
        });
        await tx.auditLog.create({
          data: auditData({
            firmId: session.firm.id,
            actorId: session.user.id,
            action: "reconciliation.run",
            entityType: "Reconciliation",
            entityId: reconciliationId,
            details: { results: results.length, needsReview: summary.needsReview },
          }),
        });
        await notify(tx, {
          firmId: session.firm.id,
          kind: "reconciliation.completed",
          title: `Reconciliation completed · ${recon.client.name} · ${formatPeriod(recon.period)}`,
          body:
            summary.needsReview > 0
              ? `${results.length} results. ${summary.needsReview} need review before finalisation.`
              : `${results.length} results. Every record matched exactly.`,
          href: `/reconciliation/${reconciliationId}/results`,
        });
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    return { ok: true };
  } catch (error) {
    console.error("[recon.run] failed", { reconciliationId, error });
    await db.reconciliation
      .update({ where: { id: reconciliationId }, data: { status: "FAILED", error: "The run did not complete. No results were saved." } })
      .catch(() => undefined);
    await notify(db, {
      firmId: session.firm.id,
      kind: "reconciliation.failed",
      title: `Reconciliation failed · ${recon.client.name} · ${formatPeriod(recon.period)}`,
      body: "The run did not complete and no results were saved. You can try again from the reconciliation page.",
      href: `/reconciliation/${reconciliationId}`,
      userIds: [session.user.id],
    }).catch(() => undefined);
    return { ok: false, error: "The reconciliation could not be completed. No results were saved — please try again." };
  }
}
