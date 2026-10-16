"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { requireSession } from "@/lib/auth/session";

const schema = z.object({
  reconciliationId: z.string().min(1),
  note: z.string().trim().min(10, "Add a short finalisation note (at least 10 characters).").max(2000, "Keep the note under 2,000 characters."),
  confirm: z.literal("yes", "Tick the confirmation box to finalise."),
});

/**
 * Finalise a reconciliation.
 * Rules (all re-checked on the server, whatever the page showed):
 *  - only workspace owners and admins may finalise;
 *  - the reconciliation must be completed and not already finalised;
 *  - no result may still be pending review;
 *  - the user must confirm and give a note.
 * The update is conditional (finalizedAt IS NULL), so two people pressing the
 * button at once cannot both finalise, and pending reviews are counted inside
 * the same transaction.
 */
export async function finaliseReconciliation(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    reconciliationId: formData.get("reconciliationId"),
    note: formData.get("note") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  const id = String(formData.get("reconciliationId") ?? "");
  const back = `/reconciliation/${id}/finalise`;
  const fail = (message: string): never => redirect(`${back}?error=${encodeURIComponent(message)}`);

  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  if (session.role === "MEMBER") fail("Only workspace owners and admins can finalise a reconciliation.");
  const { reconciliationId, note } = parsed.data!;

  let outcome: "ok" | "missing" | "pending" | "already" = "ok";
  try {
    outcome = await db.$transaction(async (tx) => {
      const recon = await tx.reconciliation.findFirst({
        where: { id: reconciliationId, firmId: session.firm.id, status: "COMPLETED" },
        select: { id: true, finalizedAt: true },
      });
      if (!recon) return "missing" as const;
      if (recon.finalizedAt) return "already" as const;
      const pending = await tx.matchResult.count({
        where: { reconciliationId, firmId: session.firm.id, needsReview: true, reviewStatus: "PENDING" },
      });
      if (pending > 0) return "pending" as const;

      const updated = await tx.reconciliation.updateMany({
        where: { id: reconciliationId, firmId: session.firm.id, finalizedAt: null },
        data: { finalizedAt: new Date(), finalizedById: session.user.id, finalNote: note },
      });
      if (updated.count !== 1) return "already" as const;

      await tx.auditLog.create({
        data: auditData({
          firmId: session.firm.id,
          actorId: session.user.id,
          action: "reconciliation.finalized",
          entityType: "Reconciliation",
          entityId: reconciliationId,
          details: { note },
        }),
      });
      await notify(tx, {
        firmId: session.firm.id,
        kind: "reconciliation.finalized",
        title: "Reconciliation finalised",
        body: `${session.user.name} finalised a reconciliation. Reviews are now locked.`,
        href: `/reconciliation/${reconciliationId}/finalise`,
        excludeUserId: session.user.id,
      });
      return "ok" as const;
    });
  } catch (error) {
    console.error("[recon.finalise] failed", { reconciliationId, error });
    fail("Finalisation could not be saved. Nothing was changed — please try again.");
  }

  if (outcome === "missing") fail("Only a completed reconciliation in your workspace can be finalised.");
  if (outcome === "already") fail("This reconciliation has already been finalised.");
  if (outcome === "pending") fail("Some results are still pending review. Review them before finalising.");
  redirect(`${back}?done=1`);
}
