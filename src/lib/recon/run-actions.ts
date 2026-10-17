"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { runReconciliation } from "./run";

export async function runReconciliationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("reconciliationId") ?? "");
  const outcome = await runReconciliation(session, id);
  if (!outcome.ok) redirect(`/reconciliation/${id}?error=${encodeURIComponent(outcome.error)}`);
  redirect(`/reconciliation/${id}/results`);
}

const reviewSchema = z.object({
  resultId: z.string().min(1),
  decision: z.enum(["ACCEPTED", "REJECTED", "PENDING"]),
  note: z.string().trim().max(1000, "Keep the note under 1,000 characters."),
});

/**
 * Record a reviewer's decision on one result. The original data and the
 * engine's classification are never changed — only the review fields are.
 */
export async function reviewResult(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = reviewSchema.safeParse({
    resultId: formData.get("resultId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  const back = String(formData.get("back") ?? "/reconciliation");
  const safeBack = back.startsWith("/reconciliation/") ? back : "/reconciliation";
  // The page address already has "?back=…", so status flags are added with "&"
  // (and any earlier flag is dropped first) — otherwise the banner never shows.
  const to = (key: "saved" | "error", value: string) => {
    const [path, query = ""] = safeBack.split("?");
    const params = new URLSearchParams(query);
    params.delete("saved");
    params.delete("error");
    params.set(key, value);
    return `${path}?${params.toString()}`;
  };
  if (!parsed.success) redirect(to("error", parsed.error.issues[0]?.message ?? "Invalid review."));
  const { resultId, decision, note } = parsed.data;

  const result = await db.matchResult.findFirst({
    where: { id: resultId, firmId: session.firm.id },
    select: { id: true, reviewStatus: true, reconciliation: { select: { id: true, finalizedAt: true } } },
  });
  if (!result) redirect("/reconciliation");
  if (result.reconciliation.finalizedAt) {
    redirect(to("error", "This reconciliation is finalised. Reviews can no longer be changed."));
  }
  if (decision === "REJECTED" && !note) {
    redirect(to("error", "Add a note explaining why the match is rejected."));
  }

  await db.$transaction([
    db.matchResult.update({
      where: { id: result.id },
      data: {
        reviewStatus: decision,
        reviewNote: note || null,
        reviewedById: decision === "PENDING" ? null : session.user.id,
        reviewedAt: decision === "PENDING" ? null : new Date(),
      },
    }),
    db.auditLog.create({
      data: auditData({
        firmId: session.firm.id,
        actorId: session.user.id,
        action: "result.reviewed",
        entityType: "MatchResult",
        entityId: result.id,
        details: { from: result.reviewStatus, to: decision, note: note || null, reconciliationId: result.reconciliation.id },
      }),
    }),
  ]);
  redirect(to("saved", "1"));
}
