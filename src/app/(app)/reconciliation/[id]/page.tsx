import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleAlert, CircleCheck, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/recon/money";
import { formatPeriod } from "@/lib/recon/periods";
import { FIELD_LABELS, FIELDS, REQUIRED_FIELDS, type Mapping, type RowIssue } from "@/lib/recon/import";
import { SOURCE_LABEL, type ImportStats, type Source } from "@/lib/recon/store";
import { applyMapping } from "@/lib/recon/actions";
import { runReconciliationAction } from "@/lib/recon/run-actions";
import { buttonPrimary } from "@/components/app/page-header";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "../status-badge";
import { UploadForm } from "./upload-card";
import { SubmitButton } from "./submit-button";

export const metadata: Metadata = { title: "Reconciliation" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mapped?: string; error?: string }>;
};

const SOURCES: { source: Source; hint: string }[] = [
  { source: "PURCHASE_REGISTER", hint: "Purchases as recorded in the client's books (Tally, Busy, Excel…)." },
  { source: "GSTR2B", hint: "Downloaded from the GST portal. Upload the Excel file; the B2B sheet is found automatically." },
];

export default async function ReconciliationPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const { mapped, error } = await searchParams;

  // Firm-scoped: another workspace's reconciliation ID returns 404.
  const recon = await db.reconciliation.findFirst({
    where: { id, firmId: session.firm.id },
    select: {
      id: true,
      period: true,
      status: true,
      error: true,
      createdAt: true,
      client: { select: { id: true, name: true, gstin: true } },
      files: {
        select: {
          id: true,
          source: true,
          fileName: true,
          fileSize: true,
          sheetName: true,
          headers: true,
          mapping: true,
          stats: true,
          errors: true,
          warnings: true,
          createdAt: true,
        },
      },
    },
  });
  if (!recon) notFound();

  const samples = await Promise.all(
    SOURCES.map(({ source }) =>
      db.invoiceRow.findMany({
        where: { reconciliationId: recon.id, source },
        orderBy: { sourceRow: "asc" },
        take: 5,
        select: { id: true, sourceRow: true, gstin: true, invoiceNo: true, invoiceDate: true, docType: true, taxable: true, igst: true, cgst: true, sgst: true },
      }),
    ),
  );

  const fileFor = (s: Source) => recon.files.find((f) => f.source === s);
  const statsFor = (s: Source) => fileFor(s)?.stats as unknown as ImportStats | undefined;
  const ready = SOURCES.every(({ source }) => {
    const st = statsFor(source);
    return st && st.valid > 0 && st.mappingProblems.length === 0;
  });

  return (
    <div className="space-y-6">
      <Link href="/reconciliation" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Reconciliation
      </Link>

      {mapped === "1" && (
        <Banner tone="success">Column choices applied and the file was re-checked.</Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}

      <PageHeader
        title={`${recon.client.name} · ${formatPeriod(recon.period)}`}
        description={recon.client.gstin ? `GSTIN ${recon.client.gstin}` : "Unregistered client"}
        actions={<StatusBadge status={recon.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {SOURCES.map(({ source, hint }, i) => {
          const file = fileFor(source);
          return (
            <section key={source} className="flex flex-col rounded-2xl border border-line bg-white">
              <header className="flex items-start gap-3 border-b border-line px-5 py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-semibold text-ink">{SOURCE_LABEL[source]}</h2>
                  <p className="text-xs text-slate-600">{hint}</p>
                </div>
              </header>
              <div className="flex-1 space-y-5 p-5">
                {file ? (
                  <ImportReport
                    file={file}
                    stats={file.stats as unknown as ImportStats}
                    sample={samples[i]}
                    editable={recon.status !== "COMPLETED"}
                  />
                ) : null}
                {recon.status !== "COMPLETED" &&
                  (file ? (
                    <details className="rounded-lg border border-line">
                      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700">Replace file</summary>
                      <div className="border-t border-line p-4">
                        <UploadForm reconciliationId={recon.id} source={source} label={SOURCE_LABEL[source]} replacing />
                      </div>
                    </details>
                  ) : (
                    <UploadForm reconciliationId={recon.id} source={source} label={SOURCE_LABEL[source]} replacing={false} />
                  ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">3. Run reconciliation</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {recon.status === "COMPLETED"
              ? "This reconciliation has been run. Files are locked; start a new reconciliation to use different files."
              : recon.status === "FAILED"
                ? recon.error ?? "The last run did not complete. You can try again."
                : ready
                  ? "Both files are imported. Rows with errors are excluded and listed above."
                  : "Upload both files and resolve any column problems first."}
          </p>
        </div>
        {recon.status === "COMPLETED" ? (
          <Link href={`/reconciliation/${recon.id}/results`} className={buttonPrimary}>
            View results
          </Link>
        ) : !ready ? (
          <button type="button" disabled className="inline-flex shrink-0 cursor-not-allowed items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white opacity-50">
            Run reconciliation
          </button>
        ) : (
          <form action={runReconciliationAction}>
            <input type="hidden" name="reconciliationId" value={recon.id} />
            <SubmitButton
              pendingText="Matching invoices…"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {recon.status === "FAILED" ? "Try again" : "Run reconciliation"}
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

type FileView = {
  id: string;
  fileName: string;
  fileSize: number;
  sheetName: string | null;
  headers: unknown;
  mapping: unknown;
  errors: unknown;
  warnings: unknown;
  createdAt: Date;
};

type SampleRow = {
  id: string;
  sourceRow: number;
  gstin: string;
  invoiceNo: string;
  invoiceDate: string | null;
  docType: string;
  taxable: bigint;
  igst: bigint;
  cgst: bigint;
  sgst: bigint;
};

function ImportReport({ file, stats, sample, editable }: { file: FileView; stats: ImportStats; sample: SampleRow[]; editable: boolean }) {
  const headers = file.headers as string[];
  const mapping = file.mapping as Mapping;
  const errors = file.errors as RowIssue[];
  const warnings = file.warnings as RowIssue[];
  const blocked = stats.mappingProblems.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{file.fileName}</p>
          <p className="text-xs text-muted">
            {(file.fileSize / 1024).toFixed(0)} KB{file.sheetName && file.sheetName !== "CSV" ? ` · sheet “${file.sheetName}”` : ""} · uploaded{" "}
            {formatDateTime(file.createdAt)}
          </p>
        </div>
      </div>

      {blocked ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            Columns need your attention — nothing has been imported yet
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {stats.mappingProblems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
          <p className="mt-2">Use “Check columns” below to choose the right ones.</p>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Rows read" value={stats.dataRows} />
          <Stat label="Imported" value={stats.valid} tone="good" />
          <Stat label="With errors" value={stats.withErrors} tone={stats.withErrors ? "bad" : undefined} />
          <Stat label="Blank" value={stats.blank} />
        </dl>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            {stats.warningCount} warning{stats.warningCount === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i}>
                {w.row > 0 && <span className="font-mono text-xs">Row {w.row}: </span>}
                {w.message}
              </li>
            ))}
          </ul>
          {warnings.length > 8 && <p className="mt-2 text-xs">…and {warnings.length - 8} more.</p>}
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-ink">
            Rows not imported ({stats.withErrors}) — fix these in the file and upload it again
          </p>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Row</th>
                  <th scope="col" className="px-3 py-2 font-medium">Column</th>
                  <th scope="col" className="px-3 py-2 font-medium">Problem</th>
                  <th scope="col" className="px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {errors.slice(0, 100).map((e, i) => (
                  <tr key={i}>
                    <td className="tabular px-3 py-1.5 font-mono">{e.row}</td>
                    <td className="px-3 py-1.5">{e.field ? FIELD_LABELS[e.field] : "—"}</td>
                    <td className="px-3 py-1.5 text-rose-700">{e.message}</td>
                    <td className="max-w-[10rem] truncate px-3 py-1.5 font-mono text-slate-600">{e.value || "(blank)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.errorCount > 100 && <p className="mt-1 text-xs text-muted">Showing the first 100 of {stats.errorCount} problems.</p>}
        </div>
      )}

      {sample.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            First imported rows — check they look right
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Row</th>
                  <th scope="col" className="px-3 py-2 font-medium">GSTIN</th>
                  <th scope="col" className="px-3 py-2 font-medium">Invoice</th>
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Taxable ₹</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tax ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sample.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular px-3 py-1.5 font-mono text-muted">{r.sourceRow}</td>
                    <td className="px-3 py-1.5 font-mono">{r.gstin}</td>
                    <td className="px-3 py-1.5">
                      {r.invoiceNo}
                      {r.docType !== "INVOICE" && <span className="ml-1 text-muted">({r.docType === "CREDIT_NOTE" ? "CN" : "DN"})</span>}
                    </td>
                    <td className="px-3 py-1.5">{r.invoiceDate ?? "—"}</td>
                    <td className="tabular px-3 py-1.5 text-right">{formatPaise(Number(r.taxable))}</td>
                    <td className="tabular px-3 py-1.5 text-right">{formatPaise(Number(r.igst + r.cgst + r.sgst))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editable && (
        <details className="rounded-lg border border-line" open={blocked}>
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700">Check columns</summary>
          <form action={applyMapping} className="space-y-4 border-t border-line p-4">
            <input type="hidden" name="importFileId" value={file.id} />
            {stats.sheetNames.length > 1 && (
              <div>
                <label htmlFor={`sheet-${file.id}`} className="block text-xs font-medium text-slate-700">Sheet</label>
                <select
                  id={`sheet-${file.id}`}
                  name="sheetName"
                  defaultValue={file.sheetName ?? ""}
                  className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                >
                  {stats.sheetNames.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">Changing the sheet detects its columns again.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field}>
                  <label htmlFor={`map-${file.id}-${field}`} className="block text-xs font-medium text-slate-700">
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) && <span className="text-rose-500"> *</span>}
                  </label>
                  <select
                    id={`map-${file.id}-${field}`}
                    name={`map.${field}`}
                    defaultValue={mapping[field] === null ? "" : String(mapping[field])}
                    className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— Not in this file —</option>
                    {headers.map((h, col) => (
                      <option key={col} value={col}>
                        {columnLetter(col)} · {h || "(no title)"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <SubmitButton
                pendingText="Re-checking the file…"
                className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
              >
                Apply columns
              </SubmitButton>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-ink";
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`tabular mt-0.5 text-lg font-semibold ${color}`}>{value.toLocaleString("en-IN")}</dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const cls = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800";
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

/** 0 -> A, 25 -> Z, 26 -> AA */
function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
