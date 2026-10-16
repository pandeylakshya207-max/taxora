"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";

const GSTIN = /^[0-9A-Z]{15}$/;
const back = (gstin: string, qs: string) => `/vendors/${encodeURIComponent(gstin)}?${qs}`;

const saveSchema = z.object({
  supplierGstin: z.string().regex(GSTIN),
  clientId: z.string().min(1),
  periodLabel: z.string().min(1).max(100),
  subject: z.string().trim().min(5, "Subject is too short.").max(300),
  body: z.string().trim().min(20, "Message is too short.").max(20000),
  resultIds: z.string().max(200000),
});

/** Save an (optionally edited) draft. Nothing is sent. */
export async function saveFollowUp(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  const gstin = String(formData.get("supplierGstin") ?? "");
  if (!parsed.success) redirect(back(gstin, `error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid draft.")}`));
  const d = parsed.data;

  const client = await db.client.findFirst({ where: { id: d.clientId, firmId: session.firm.id }, select: { id: true } });
  if (!client) redirect(back(gstin, `error=${encodeURIComponent("Client not found.")}`));

  // Only keep result IDs that belong to this workspace.
  const ids = d.resultIds.split(",").filter(Boolean).slice(0, 1000);
  const valid = await db.matchResult.findMany({ where: { id: { in: ids }, firmId: session.firm.id }, select: { id: true } });

  const followUp = await db.followUp.create({
    data: {
      firmId: session.firm.id,
      clientId: client.id,
      supplierGstin: d.supplierGstin,
      periodLabel: d.periodLabel,
      matchResultIds: valid.map((v) => v.id),
      subject: d.subject,
      body: d.body,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  await db.auditLog.create({
    data: auditData({
      firmId: session.firm.id,
      actorId: session.user.id,
      action: "followup.drafted",
      entityType: "FollowUp",
      entityId: followUp.id,
      details: { supplierGstin: d.supplierGstin, invoices: valid.length },
    }),
  });
  redirect(back(gstin, "saved=1"));
}

const statusSchema = z.object({
  followUpId: z.string().min(1),
  status: z.enum(["DRAFT", "SENT", "RESOLVED"]),
  note: z.string().trim().max(1000).optional(),
});

/** Record what the user did outside Taxora (sent the email, issue resolved). */
export async function updateFollowUpStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = statusSchema.safeParse({
    followUpId: formData.get("followUpId"),
    status: formData.get("status"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) redirect("/vendors");
  const f = await db.followUp.findFirst({
    where: { id: parsed.data.followUpId, firmId: session.firm.id },
    select: { id: true, status: true, supplierGstin: true },
  });
  if (!f) redirect("/vendors");

  await db.$transaction([
    db.followUp.update({ where: { id: f.id }, data: { status: parsed.data.status, note: parsed.data.note || undefined } }),
    db.auditLog.create({
      data: auditData({
        firmId: session.firm.id,
        actorId: session.user.id,
        action: "followup.status",
        entityType: "FollowUp",
        entityId: f.id,
        details: { from: f.status, to: parsed.data.status },
      }),
    }),
  ]);
  redirect(back(f.supplierGstin, "updated=1"));
}
