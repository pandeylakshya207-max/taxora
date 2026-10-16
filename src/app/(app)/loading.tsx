/** Shown instantly while a signed-in page loads its data. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-72 animate-pulse rounded bg-slate-200/80" />
      <div className="h-48 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}
