/** Display helpers. All dates are shown in Indian Standard Time. */

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export const formatDateTime = (d: Date) => dateTime.format(d);
export const formatDate = (d: Date) => dateOnly.format(d);

const ACTION_LABELS: Record<string, string> = {
  "firm.created": "Created the workspace",
  "client.created": "Added a client",
  "client.updated": "Updated a client",
  "client.archived": "Archived a client",
  "user.email_verified": "Verified their email",
  "reconciliation.created": "Started a reconciliation",
  "import.uploaded": "Uploaded a file",
  "import.remapped": "Corrected file columns",
  "reconciliation.run": "Ran a reconciliation",
  "result.reviewed": "Reviewed a result",
  "export.generated": "Downloaded a report",
  "reconciliation.finalized": "Finalised a reconciliation",
  "followup.drafted": "Drafted a supplier follow-up",
  "followup.status": "Updated a supplier follow-up",
  "compliance.rule_created": "Added a due-date rule",
  "compliance.rule_enabled": "Enabled a due-date rule",
  "compliance.rule_disabled": "Disabled a due-date rule",
  "compliance.tasks_generated": "Created compliance tasks",
  "compliance.task_created": "Added a compliance task",
  "compliance.task_updated": "Updated a compliance task",
  "user.profile_updated": "Updated their profile",
  "user.password_changed": "Changed their password",
  "user.sessions_revoked": "Signed out other sessions",
  "workspace.updated": "Updated workspace details",
  "workspace.matching_updated": "Changed matching rules",
  "workspace.matching_reset": "Reset matching rules to defaults",
  "support.ticket_created": "Raised a support request",
  "support.ticket_status": "Changed a support request's status",
  "ai.explained": "Asked AI to explain a result",
  "ai.summarized": "Asked AI to summarise a reconciliation",
};

export const describeAction = (action: string) => ACTION_LABELS[action] ?? action;

export const BUSINESS_TYPES = [
  { value: "PROPRIETORSHIP", label: "Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "LLP", label: "LLP" },
  { value: "PRIVATE_LIMITED", label: "Private Limited" },
  { value: "PUBLIC_LIMITED", label: "Public Limited" },
  { value: "TRUST", label: "Trust" },
  { value: "OTHER", label: "Other" },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPES)[number]["value"];

export const businessTypeLabel = (value: string | null) =>
  BUSINESS_TYPES.find((t) => t.value === value)?.label ?? "—";
