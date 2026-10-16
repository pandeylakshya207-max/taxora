"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Upload } from "lucide-react";

export function UploadForm({
  reconciliationId,
  source,
  label,
  replacing,
}: {
  reconciliationId: string;
  source: "PURCHASE_REGISTER" | "GSTR2B";
  label: string;
  replacing: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `file-${source}`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("source", source);
      body.set("file", file);
      const res = await fetch(`/api/reconciliations/${reconciliationId}/upload`, { method: "POST", body });
      const data: { ok: boolean; error?: string } = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) {
        setError(data.error ?? `Upload failed (HTTP ${res.status}). Please try again.`);
        return;
      }
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error — the file was not uploaded. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface px-4 py-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500"
      >
        <Upload className="h-5 w-5 text-slate-500" aria-hidden="true" />
        <span className="text-sm font-medium text-ink">
          {fileName ?? (replacing ? `Choose a new ${label} file` : `Choose the ${label} file`)}
        </span>
        <span className="text-xs text-muted">Excel (.xlsx) or CSV, up to 10 MB</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !fileName}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {pending ? "Reading and checking the file…" : replacing ? "Replace file" : "Upload"}
      </button>
    </form>
  );
}
