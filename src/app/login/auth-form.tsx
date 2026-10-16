"use client";

import { useActionState, useState } from "react";
import { Briefcase, Building, CircleAlert, LoaderCircle, UserRound, type LucideIcon } from "lucide-react";
import { signIn, signUp } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(isSignup ? signUp : signIn, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const [kind, setKind] = useState<Kind>((values.kind as Kind) || "CA_PRACTICE");
  const kindInfo = KINDS.find((k) => k.value === kind) ?? KINDS[0];

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {state.message && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      )}

      {isSignup && (
        <>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Who is this workspace for?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {KINDS.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                    kind === value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line text-slate-600 hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </label>
              ))}
            </div>
            {errors.kind && <p className="mt-1.5 text-xs text-rose-600">{errors.kind}</p>}
          </fieldset>
          <Field id="name" label="Your name" autoComplete="name" error={errors.name} defaultValue={values.name} />
          <Field
            id="firm"
            label={`${kindInfo.nameLabel} (optional)`}
            autoComplete="organization"
            error={errors.firm}
            defaultValue={values.firm}
            hint="Leave blank to use your own name. You can change it later."
          />
        </>
      )}
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email}
        defaultValue={values.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        error={errors.password}
        hint={isSignup ? "At least 10 characters." : undefined}
      />

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
      >
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {pending
          ? isSignup
            ? "Creating workspace…"
            : "Signing in…"
          : isSignup
            ? "Create workspace"
            : "Sign in"}
      </button>
    </form>
  );
}

type Kind = "CA_PRACTICE" | "COMPANY" | "INDIVIDUAL";

const KINDS: { value: Kind; label: string; nameLabel: string; icon: LucideIcon }[] = [
  { value: "CA_PRACTICE", label: "CA / tax practice", nameLabel: "Practice name", icon: Briefcase },
  { value: "COMPANY", label: "Company finance team", nameLabel: "Company name", icon: Building },
  { value: "INDIVIDUAL", label: "Independent professional", nameLabel: "Workspace name", icon: UserRound },
];

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:ring-2 ${
          error
            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
            : "border-line focus:border-brand-500 focus:ring-brand-500/20"
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
