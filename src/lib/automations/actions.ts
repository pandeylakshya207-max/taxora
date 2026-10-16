"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { AUTOMATIONS, isAutomationKind, resolveAutomationConfig, type AutomationKind } from "./definitions";
import { executeAutomation } from "./run";
import { STALE_RUN_MS, nextRunAfter } from "./schedule";

const back = (kind: string, params: Record<string, string>): never =>
  redirect(`/automations?${new URLSearchParams({ kind, ...params }).toString()}#${kind}`);

async function adminFor(formData: FormData): Promise<{ session: Awaited<ReturnType<typeof requireSession>>; kind: AutomationKind }> {
  const session = await requireSession();
  const kind = formData.get("kind");
  if (!isAutomationKind(kind)) redirect("/automations");
  if (session.role === "MEMBER") back(kind as string, { error: "Only owners and admins can change or run automations." });
  return { session, kind: kind as AutomationKind };
}

export async function saveAutomation(formData: FormData): Promise<void> {
  const { session, kind } = await adminFor(formData);
  const def = AUTOMATIONS[kind];
  const hour = Number.parseInt(String(formData.get("runHour") ?? ""), 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) back(kind, { error: "Choose a run time." });

  const raw: Record<string, number> = {};
  for (const f of def.fields) {
    const v = Number(formData.get(f.key));
    if (!Number.isInteger(v) || v < f.min || v > f.max) back(kind, { error: `${f.label}: enter a whole number from ${f.min} to ${f.max}.` });
    raw[f.key] = v;
  }
  const config = resolveAutomationConfig(kind, raw);
  const enabled = formData.get("enabled") === "on";
  const nextRunAt = enabled ? nextRunAfter(new Date(), hour) : null;

  await db.$transaction(async (tx) => {
    const a = await tx.automation.upsert({
      where: { firmId_kind: { firmId: session.firm.id, kind } },
      create: { firmId: session.firm.id, kind, enabled, config, runHour: hour, nextRunAt, updatedById: session.user.id },
      update: { enabled, config, runHour: hour, nextRunAt, updatedById: session.user.id, ...(enabled && { consecutiveFailures: 0 }) },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: auditData({
        firmId: session.firm.id,
        actorId: session.user.id,
        action: "automation.updated",
        entityType: "Automation",
        entityId: a.id,
        details: { automation: def.name, enabled, runHour: hour, ...config },
      }),
    });
  });
  back(kind, { saved: "1" });
}

export async function runAutomationNow(formData: FormData): Promise<void> {
  const { session, kind } = await adminFor(formData);
  const retry = formData.get("retry") === "1";
  const def = AUTOMATIONS[kind];

  // Running before the first save uses the defaults and leaves it switched off.
  const a = await db.automation.upsert({
    where: { firmId_kind: { firmId: session.firm.id, kind } },
    create: { firmId: session.firm.id, kind, enabled: false, config: def.defaults, runHour: def.defaultHour, updatedById: session.user.id },
    update: {},
    select: { id: true },
  });
  const running = await db.automationRun.count({
    where: { automationId: a.id, status: "RUNNING", startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } },
  });
  if (running) back(kind, { error: "This automation is already running. Refresh in a moment to see the result." });

  const out = await executeAutomation(a.id, retry ? "RETRY" : "MANUAL", { triggeredById: session.user.id });
  await db.auditLog.create({
    data: auditData({
      firmId: session.firm.id,
      actorId: session.user.id,
      action: retry ? "automation.retried" : "automation.run",
      entityType: "Automation",
      entityId: a.id,
      details: { automation: def.name, outcome: out.ok ? "succeeded" : "failed" },
    }),
  });
  back(kind, out.ok ? { ran: "1" } : { error: "The run failed — see the error in the run history below." });
}
