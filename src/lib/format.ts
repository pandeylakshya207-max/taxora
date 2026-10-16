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
