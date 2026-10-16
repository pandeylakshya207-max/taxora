"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { LIMITS, resolveReconConfig } from "@/lib/recon/config";
import { NOTIFICATION_KINDS } from "@/lib/notification-kinds";

const back = (section: string, params: Record<string, string>): never =>
  redirect(`/settings?${new URLSearchParams({ section, ...params }).toString()}#${section}`);
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

// ───────── Profile ─────────

export async function updateProfile(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = z.object({ name: z.string().trim().min(2, "Enter your name.").max(80) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) back("profile", { error: firstError(parsed.error) });
  await db.$transaction([
    db.user.update({ where: { id: session.user.id }, data: { name: parsed.data!.name } }),
    db.auditLog.create({ data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "user.profile_updated", entityType: "User", entityId: session.user.id }) }),
  ]);
  back("profile", { saved: "1" });
}

// ───────── Security ─────────

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(10, "Use at least 10 characters for the new password.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match.", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password you haven't just used.", path: ["next"] });

export async function changePassword(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("security", { error: firstError(parsed.error) });
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(parsed.data!.current, user.passwordHash))) {
    back("security", { error: "Your current password is not correct." });
  }
  const passwordHash = await hashPassword(parsed.data!.next);
  // Changing the password signs out every other session.
  await db.$transaction([
    db.user.update({ where: { id: session.user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: session.user.id, id: { not: session.sessionId } } }),
    db.auditLog.create({ data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "user.password_changed", entityType: "User", entityId: session.user.id }) }),
  ]);
  back("security", { saved: "1" });
}

export async function signOutOtherSessions(): Promise<void> {
  const session = await requireSession();
  const removed = await db.session.deleteMany({ where: { userId: session.user.id, id: { not: session.sessionId } } });
  await db.auditLog.create({
    data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "user.sessions_revoked", entityType: "User", entityId: session.user.id, details: { sessions: removed.count } }),
  });
  back("security", { saved: "1" });
}

// ───────── Workspace (owners & admins) ─────────

export async function updateWorkspace(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role === "MEMBER") back("workspace", { error: "Only owners and admins can change workspace details." });
  const parsed = z
    .object({ name: z.string().trim().min(2, "Enter the workspace name.").max(120), kind: z.enum(["CA_PRACTICE", "COMPANY", "INDIVIDUAL"]) })
    .safeParse({ name: formData.get("name"), kind: formData.get("kind") });
  if (!parsed.success) back("workspace", { error: firstError(parsed.error) });
  await db.$transaction([
    db.firm.update({ where: { id: session.firm.id }, data: parsed.data! }),
    db.auditLog.create({ data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "workspace.updated", entityType: "Firm", entityId: session.firm.id, details: parsed.data! }) }),
  ]);
  back("workspace", { saved: "1" });
}

const num = (min: number, max: number, label: string) =>
  z.coerce.number({ error: `${label} must be a number.` }).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`);

export async function updateReconSettings(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role === "MEMBER") back("matching", { error: "Only owners and admins can change matching rules." });
  const parsed = z
    .object({
      tolerance: num(LIMITS.roundingTolerancePaise[0] / 100, LIMITS.roundingTolerancePaise[1] / 100, "Rounding tolerance"),
      similarity: num(LIMITS.minInvoiceSimilarity[0] * 100, LIMITS.minInvoiceSimilarity[1] * 100, "Invoice-number similarity"),
      fuzzyValue: num(LIMITS.fuzzyMaxValueDiffPct[0], LIMITS.fuzzyMaxValueDiffPct[1], "Fuzzy value difference"),
      probableValue: num(LIMITS.probableMaxValueDiffPct[0], LIMITS.probableMaxValueDiffPct[1], "Probable value difference"),
      probableDays: num(LIMITS.probableMaxDateDiffDays[0], LIMITS.probableMaxDateDiffDays[1], "Date window"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("matching", { error: firstError(parsed.error) });
  const d = parsed.data!;

  const before = await db.firm.findUnique({ where: { id: session.firm.id }, select: { reconConfig: true } });
  const next = resolveReconConfig({
    roundingTolerancePaise: Math.round(d.tolerance * 100),
    fuzzy: { minInvoiceSimilarity: d.similarity / 100, maxValueDiffPct: d.fuzzyValue },
    probable: { maxValueDiffPct: d.probableValue, maxDateDiffDays: Math.round(d.probableDays) },
  });
  await db.$transaction([
    db.firm.update({ where: { id: session.firm.id }, data: { reconConfig: next } }),
    db.auditLog.create({
      data: auditData({
        firmId: session.firm.id,
        actorId: session.user.id,
        action: "workspace.matching_updated",
        entityType: "Firm",
        entityId: session.firm.id,
        details: { from: resolveReconConfig(before?.reconConfig), to: next },
      }),
    }),
  ]);
  back("matching", { saved: "1" });
}

export async function resetReconSettings(): Promise<void> {
  const session = await requireSession();
  if (session.role === "MEMBER") back("matching", { error: "Only owners and admins can change matching rules." });
  await db.$transaction([
    db.firm.update({ where: { id: session.firm.id }, data: { reconConfig: Prisma.DbNull } }),
    db.auditLog.create({ data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "workspace.matching_reset", entityType: "Firm", entityId: session.firm.id }) }),
  ]);
  back("matching", { saved: "1" });
}

// ───────── Notifications ─────────

export async function updateNotificationPrefs(formData: FormData): Promise<void> {
  const session = await requireSession();
  const enabled = new Set(formData.getAll("enabled").map(String));
  const muted = NOTIFICATION_KINDS.map((k) => k.kind).filter((k) => !enabled.has(k));
  await db.membership.update({
    where: { firmId_userId: { firmId: session.firm.id, userId: session.user.id } },
    data: { mutedNotifications: muted },
  });
  back("notifications", { saved: "1" });
}
