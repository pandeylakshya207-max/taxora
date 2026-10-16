"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { fieldErrorsFrom, readFields, type FormState } from "@/lib/form";
import { emptyMapping, FIELDS, type Mapping } from "./import";
import { PERIOD_PATTERN } from "./periods";
import { remapImport } from "./store";

const newReconSchema = z.object({
  clientId: z.string().min(1, "Choose a client."),
  period: z.string().regex(PERIOD_PATTERN, "Choose the tax period (month and year)."),
});

export async function createReconciliation(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["clientId", "period"] as const);
  const parsed = newReconSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };

  // The client must belong to this workspace and be active.
  const client = await db.client.findFirst({
    where: { id: parsed.data.clientId, firmId: session.firm.id, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!client) return { status: "error", fieldErrors: { clientId: "Choose one of your active clients." }, values };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const recon = await tx.reconciliation.create({
        data: {
          firmId: session.firm.id,
          clientId: client.id,
          period: parsed.data.period,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: auditData({
          firmId: session.firm.id,
          actorId: session.user.id,
          action: "reconciliation.created",
          entityType: "Reconciliation",
          entityId: recon.id,
          details: { client: client.name, period: parsed.data.period },
        }),
      });
      return recon.id;
    });
  } catch (error) {
    console.error("[recon.create] failed", error);
    return { status: "error", message: "The reconciliation could not be created. Please try again.", values };
  }
  redirect(`/reconciliation/${id}`);
}

/** Apply corrected column choices (or another sheet) to an uploaded file. */
export async function applyMapping(formData: FormData): Promise<void> {
  const session = await requireSession();
  const importFileId = String(formData.get("importFileId") ?? "");
  const sheet = formData.get("sheetName");

  const mapping: Mapping = emptyMapping();
  for (const field of FIELDS) {
    const raw = formData.get(`map.${field}`);
    const col = typeof raw === "string" && raw !== "" ? Number.parseInt(raw, 10) : NaN;
    mapping[field] = Number.isInteger(col) && col >= 0 && col < 500 ? col : null;
  }

  const outcome = await remapImport(session, importFileId, mapping, typeof sheet === "string" && sheet ? sheet : null);
  if (!outcome.reconciliationId) redirect("/reconciliation");
  const qs = outcome.ok ? "?mapped=1" : `?error=${encodeURIComponent(outcome.error)}`;
  redirect(`/reconciliation/${outcome.reconciliationId}${qs}`);
}
