/**
 * The automations Taxora can run. Names and descriptions are fixed in code so
 * the page always describes exactly what the code does. Safe for client use.
 *
 * Every automation only READS workspace data and creates in-app notifications.
 * None of them sends email, contacts suppliers or touches the GST portal.
 */

import { z } from "zod";

export const AUTOMATION_KINDS = ["COMPLIANCE_REMINDERS", "REVIEW_PENDING", "REPEATED_MISSING"] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

type Field = { key: string; label: string; min: number; max: number; help: string };

export const AUTOMATIONS: Record<
  AutomationKind,
  { name: string; description: string; notificationKind: string; fields: Field[]; defaults: Record<string, number>; defaultHour: number }
> = {
  COMPLIANCE_REMINDERS: {
    name: "Compliance due reminders",
    description:
      "Notifies the team when an open compliance task comes within the reminder window, and again if it becomes overdue. Due dates come only from your own rules and manual entries.",
    notificationKind: "automation.compliance_due",
    fields: [{ key: "daysBefore", label: "Remind this many days before the due date", min: 0, max: 30, help: "0 = only on the due date." }],
    defaults: { daysBefore: 3 },
    defaultHour: 9,
  },
  REVIEW_PENDING: {
    name: "Pending review reminders",
    description:
      "Notifies the team about completed reconciliations that still have results awaiting a review decision after a number of days. Repeats at most once a week per reconciliation.",
    notificationKind: "automation.review_pending",
    fields: [{ key: "staleDays", label: "Remind when results have waited this many days", min: 1, max: 60, help: "Counted from when the run completed." }],
    defaults: { staleDays: 3 },
    defaultHour: 10,
  },
  REPEATED_MISSING: {
    name: "Repeated missing-in-GSTR-2B alerts",
    description:
      "Flags suppliers whose invoices were missing from GSTR-2B in several periods for the same client — a signal to follow up, not evidence of non-compliance. Rejected and finalised decisions are respected.",
    notificationKind: "automation.repeated_missing",
    fields: [
      { key: "minPeriods", label: "Alert when missing in at least this many periods", min: 2, max: 12, help: "Distinct tax periods." },
      { key: "lookbackMonths", label: "Look at the last this many months", min: 2, max: 24, help: "By tax period." },
    ],
    defaults: { minPeriods: 2, lookbackMonths: 6 },
    defaultHour: 10,
  },
};

export const isAutomationKind = (k: unknown): k is AutomationKind => AUTOMATION_KINDS.includes(k as AutomationKind);

/** Stored config -> safe values. Missing or out-of-range values fall back to defaults or clamp. */
export function resolveAutomationConfig(kind: AutomationKind, raw: unknown): Record<string, number> {
  const def = AUTOMATIONS[kind];
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const f of def.fields) {
    const v = z.coerce.number().int().safeParse(obj[f.key]);
    out[f.key] = v.success && Number.isFinite(v.data) ? Math.min(f.max, Math.max(f.min, v.data)) : def.defaults[f.key];
  }
  return out;
}

export const RUN_HOURS = Array.from({ length: 24 }, (_, h) => h);
export const formatHour = (h: number) => `${String(h).padStart(2, "0")}:00 IST`;
