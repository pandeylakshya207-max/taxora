/** Shared support-desk constants. Safe for client components. */
export const TICKET_CATEGORIES = [
  { value: "bug", label: "Something isn't working" },
  { value: "import", label: "File upload / import" },
  { value: "reconciliation", label: "Matching results" },
  { value: "reports", label: "Reports & exports" },
  { value: "account", label: "Account & access" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
] as const;

export const TICKET_STATUS_LABEL = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" } as const;
export const TICKET_PRIORITY_LABEL = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" } as const;

/** Reference shown to users. Derived from the stored sequence number — never invented. */
export const ticketRef = (n: number) => `TX-${String(n).padStart(6, "0")}`;
