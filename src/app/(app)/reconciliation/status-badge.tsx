const STYLES = {
  DRAFT: ["Draft", "bg-slate-100 text-slate-700 ring-slate-500/20"],
  COMPLETED: ["Completed", "bg-emerald-50 text-emerald-700 ring-emerald-600/20"],
  FAILED: ["Failed", "bg-rose-50 text-rose-700 ring-rose-600/20"],
} as const;

export function StatusBadge({ status }: { status: keyof typeof STYLES }) {
  const [label, cls] = STYLES[status];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}
