/** Notification kinds a member can switch off. Safe for client components. */
export const NOTIFICATION_KINDS = [
  { kind: "reconciliation.completed", label: "Reconciliation completed", help: "When a run finishes, with how many results need review." },
  { kind: "reconciliation.failed", label: "Reconciliation failed", help: "When a run you started does not complete." },
  { kind: "import.failed", label: "Import failed", help: "When a file you uploaded could not be read or saved." },
  { kind: "reconciliation.finalized", label: "Reconciliation finalised", help: "When someone finalises a reconciliation." },
  { kind: "client.created", label: "Client added", help: "When someone adds a client." },
  { kind: "support.updated", label: "Support ticket updates", help: "When a ticket you raised changes status." },
  { kind: "automation.compliance_due", label: "Compliance due reminders", help: "From the automation: open tasks due soon or overdue." },
  { kind: "automation.review_pending", label: "Pending review reminders", help: "From the automation: reconciliations still awaiting review." },
  { kind: "automation.repeated_missing", label: "Repeated missing-in-GSTR-2B alerts", help: "From the automation: suppliers missing in several periods." },
  { kind: "automation.failed", label: "Automation failed", help: "Owners and admins: when a scheduled automation keeps failing." },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["kind"];
