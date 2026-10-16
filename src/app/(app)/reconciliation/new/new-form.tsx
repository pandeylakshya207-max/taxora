"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { createReconciliation } from "@/lib/recon/actions";
import { initialFormState } from "@/lib/form";
import { buttonPrimary, buttonSecondary } from "@/components/app/page-header";

const inputClass = (error?: string) =>
  `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink shadow-sm outline-none focus:ring-2 ${
    error ? "border-rose-400 focus:ring-rose-500/20" : "border-line focus:border-brand-500 focus:ring-brand-500/20"
  }`;

export function NewReconciliationForm({
  clients,
  defaultClientId,
}: {
  clients: { id: string; name: string; gstin: string | null }[];
  defaultClientId?: string;
}) {
  const [state, action, pending] = useActionState(createReconciliation, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message && (
        <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}
      <div>
        <label htmlFor="clientId" className="block text-sm font-medium text-slate-700">Client</label>
        <select
          id="clientId"
          name="clientId"
          defaultValue={values.clientId ?? defaultClientId ?? ""}
          aria-invalid={errors.clientId ? true : undefined}
          aria-describedby={errors.clientId ? "clientId-error" : undefined}
          className={inputClass(errors.clientId)}
        >
          <option value="" disabled>Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.gstin ? ` — ${c.gstin}` : ""}
            </option>
          ))}
        </select>
        {errors.clientId && <p id="clientId-error" className="mt-1.5 text-xs text-rose-600">{errors.clientId}</p>}
      </div>
      <div>
        <label htmlFor="period" className="block text-sm font-medium text-slate-700">Tax period</label>
        <input
          id="period"
          name="period"
          type="month"
          min="2017-07"
          defaultValue={values.period}
          aria-invalid={errors.period ? true : undefined}
          aria-describedby={errors.period ? "period-error" : "period-hint"}
          className={inputClass(errors.period)}
        />
        {errors.period ? (
          <p id="period-error" className="mt-1.5 text-xs text-rose-600">{errors.period}</p>
        ) : (
          <p id="period-hint" className="mt-1.5 text-xs text-muted">The month the GSTR-2B statement is for.</p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Link href="/reconciliation" className={buttonSecondary}>Cancel</Link>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending ? "Creating…" : "Continue to upload"}
        </button>
      </div>
    </form>
  );
}
