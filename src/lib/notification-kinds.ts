/** Notification kinds a member can switch off. Safe for client components. */
export const NOTIFICATION_KINDS = [
  { kind: "reconciliation.completed", label: "Reconciliation completed", help: "When a run finishes, with how many results need review." },
  { kind: "reconciliation.failed", label: "Reconciliation failed", help: "When a run you started does not complete." },
  { kind: "import.failed", label: "Import failed", help: "When a file you uploaded could not be read or saved." },
  { kind: "reconciliation.finalized", label: "Reconciliation finalised", help: "When someone finalises a reconciliation." },
  { kind: "client.created", label: "Client added", help: "When someone adds a client." },
  { kind: "support.updated", label: "Support ticket updates", help: "When a ticket you raised changes status." },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["kind"];
