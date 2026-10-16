"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/clients/actions";
import { initialFormState } from "@/lib/form";
import { BUSINESS_TYPES } from "@/lib/format";
import { buttonPrimary, buttonSecondary } from "@/components/app/page-header";

const inputClass = (error?: string) =>
  `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:ring-2 ${
    error
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
      : "border-line focus:border-brand-500 focus:ring-brand-500/20"
  }`;

export function ClientForm() {
  const [state, formAction, pending] = useActionState(createClient, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.message && (
        <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 text-sm font-semibold text-ink">Business</legend>
        <div className="sm:col-span-2">
          <Field id="name" label="Business name" required error={errors.name}>
            <input id="name" name="name" defaultValue={values.name} autoComplete="organization"
              aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "name-error" : undefined}
              className={inputClass(errors.name)} />
          </Field>
        </div>
        <Field id="gstin" label="GSTIN" hint="15 characters. Leave blank if the client is unregistered." error={errors.gstin}>
          <input id="gstin" name="gstin" defaultValue={values.gstin} maxLength={20} spellCheck={false}
            autoCapitalize="characters" placeholder="e.g. 27AAPFU0939F1ZV"
            aria-invalid={errors.gstin ? true : undefined}
            aria-describedby={errors.gstin ? "gstin-error" : "gstin-hint"}
            className={`${inputClass(errors.gstin)} font-mono uppercase placeholder:normal-case placeholder:font-sans`} />
        </Field>
        <Field id="businessType" label="Business type" error={errors.businessType}>
          <select id="businessType" name="businessType" defaultValue={values.businessType ?? ""}
            aria-invalid={errors.businessType ? true : undefined}
            aria-describedby={errors.businessType ? "businessType-error" : undefined}
            className={inputClass(errors.businessType)}>
            <option value="">Not specified</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      <div className="border-t border-line pt-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 text-sm font-semibold text-ink">Contact <span className="font-normal text-muted">(optional)</span></legend>
        <div className="sm:col-span-2">
          <Field id="contactName" label="Contact person" error={errors.contactName}>
            <input id="contactName" name="contactName" defaultValue={values.contactName} autoComplete="name"
              aria-invalid={errors.contactName ? true : undefined}
              aria-describedby={errors.contactName ? "contactName-error" : undefined}
              className={inputClass(errors.contactName)} />
          </Field>
        </div>
        <Field id="email" label="Business email" error={errors.email}>
          <input id="email" name="email" type="email" defaultValue={values.email} autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={inputClass(errors.email)} />
        </Field>
        <Field id="phone" label="Phone" error={errors.phone}>
          <input id="phone" name="phone" type="tel" defaultValue={values.phone} autoComplete="tel"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            className={inputClass(errors.phone)} />
        </Field>
      </fieldset>
      </div>

      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <Link href="/clients" className={buttonSecondary}>Cancel</Link>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending ? "Saving…" : "Save client"}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
