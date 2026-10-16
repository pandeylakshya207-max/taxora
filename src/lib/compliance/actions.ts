"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { PERIOD_PATTERN, formatPeriod } from "@/lib/recon/periods";
import { dueDateFor, isIsoDate } from "./dates";

const go = (path: string, params: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(params).toString()}`);

// ───────── Rules ─────────

const ruleSchema = z.object({
  label: z.string().trim().min(3, "Give the rule a name, e.g. GSTR-3B (monthly).").max(80),
  dayOfMonth: z.coerce.number().int().min(1, "Day must be 1–31.").max(31, "Day must be 1–31."),
  monthOffset: z.coerce.number().int().min(0).max(12),
  sourceNote: z
    .string()
    .trim()
    .min(5, "Record where this date comes from (e.g. the notification or circular).")
    .max(300),
});

export async function createRule(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go("/compliance/rules", { error: parsed.error.issues[0]?.message ?? "Check the rule." });
  const rule = await db.dueDateRule.create({
    data: { ...parsed.data!, firmId: session.firm.id, createdById: session.user.id },
    select: { id: true },
  });
  await db.auditLog.create({
    data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "compliance.rule_created", entityType: "DueDateRule", entityId: rule.id, details: parsed.data! }),
  });
  go("/compliance/rules", { saved: "1" });
}

export async function setRuleActive(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("ruleId") ?? "");
  const active = formData.get("active") === "true";
  const updated = await db.dueDateRule.updateMany({ where: { id, firmId: session.firm.id }, data: { active } });
  if (updated.count) {
    await db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: active ? "compliance.rule_enabled" : "compliance.rule_disabled", entityType: "DueDateRule", entityId: id }),
    });
  }
  go("/compliance/rules", { saved: "1" });
}

// ───────── Generate tasks from a rule ─────────

export async function generateTasks(formData: FormData): Promise<void> {
  const session = await requireSession();
  const ruleId = String(formData.get("ruleId") ?? "");
  const period = String(formData.get("period") ?? "");
  const clientIds = formData.getAll("clientIds").map(String).slice(0, 500);
  if (!PERIOD_PATTERN.test(period)) go("/compliance", { error: "Choose a tax period." });
  if (!clientIds.length) go("/compliance", { error: "Choose at least one client." });

  const rule = await db.dueDateRule.findFirst({ where: { id: ruleId, firmId: session.firm.id, active: true } });
  if (!rule) go("/compliance", { error: "Choose an active due-date rule." });
  const clients = await db.client.findMany({
    where: { id: { in: clientIds }, firmId: session.firm.id, status: "ACTIVE" },
    select: { id: true, name: true },
  });

  const dueDate = dueDateFor(period, rule!);
  // skipDuplicates relies on the unique (firm, rule, client, period) constraint:
  // generating twice never creates duplicate tasks.
  const created = await db.complianceTask.createMany({
    data: clients.map((c) => ({
      firmId: session.firm.id,
      clientId: c.id,
      title: `${rule!.label} · ${formatPeriod(period)}`,
      period,
      dueDate,
      dueDateSource: "RULE" as const,
      sourceNote: rule!.sourceNote,
      ruleId: rule!.id,
      createdById: session.user.id,
    })),
    skipDuplicates: true,
  });
  await db.auditLog.create({
    data: auditData({
      firmId: session.firm.id,
      actorId: session.user.id,
      action: "compliance.tasks_generated",
      entityType: "DueDateRule",
      entityId: rule!.id,
      details: { period, dueDate, created: created.count, requested: clients.length },
    }),
  });
  go("/compliance", { generated: String(created.count), skipped: String(clients.length - created.count) });
}

// ───────── Manual tasks ─────────

const taskSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title.").max(160),
  clientId: z.string().optional(),
  period: z.string().optional(),
  dueDate: z.string().refine(isIsoDate, "Choose a valid due date."),
  sourceNote: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function createTask(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go("/compliance", { error: parsed.error.issues[0]?.message ?? "Check the task." });
  const d = parsed.data!;
  if (d.period && !PERIOD_PATTERN.test(d.period)) go("/compliance", { error: "Tax period is not valid." });

  let clientId: string | null = null;
  if (d.clientId) {
    const c = await db.client.findFirst({ where: { id: d.clientId, firmId: session.firm.id }, select: { id: true } });
    if (!c) go("/compliance", { error: "Client not found." });
    clientId = c!.id;
  }
  const task = await db.complianceTask.create({
    data: {
      firmId: session.firm.id,
      clientId,
      title: d.title,
      period: d.period || null,
      dueDate: d.dueDate,
      dueDateSource: "MANUAL",
      sourceNote: d.sourceNote || null,
      notes: d.notes || null,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  await db.auditLog.create({
    data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "compliance.task_created", entityType: "ComplianceTask", entityId: task.id, details: { title: d.title, dueDate: d.dueDate } }),
  });
  go("/compliance", { saved: "1" });
}

const updateSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "NOT_APPLICABLE"]),
  notes: z.string().trim().max(2000).optional(),
  back: z.string().optional(),
});

export async function updateTask(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go("/compliance", { error: "Could not update the task." });
  const d = parsed.data!;
  const task = await db.complianceTask.findFirst({ where: { id: d.taskId, firmId: session.firm.id }, select: { id: true, status: true } });
  if (!task) go("/compliance", { error: "Task not found." });

  await db.$transaction([
    db.complianceTask.update({
      where: { id: task!.id },
      data: {
        status: d.status,
        notes: d.notes === undefined ? undefined : d.notes || null,
        completedAt: d.status === "DONE" ? new Date() : null,
      },
    }),
    db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "compliance.task_updated", entityType: "ComplianceTask", entityId: task!.id, details: { from: task!.status, to: d.status } }),
    }),
  ]);
  const back = d.back?.startsWith("/compliance") ? d.back : "/compliance";
  redirect(back);
}
