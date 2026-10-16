"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { resendCode, verifyEmail } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form";

export function VerifyForms({ hasActiveCode }: { hasActiveCode: boolean }) {
  const [verifyState, verifyAction, verifying] = useActionState(verifyEmail, initialFormState);
  const [resendState, resendAction, resending] = useActionState(resendCode, initialFormState);
  const codeError = verifyState.fieldErrors?.code;
  // A successful resend means a fresh code exists even if the page loaded without one.
  const canEnterCode = hasActiveCode || (resendState.status === "idle" && Boolean(resendState.message));

  return (
    <div className="mt-6 space-y-4">
      {canEnterCode && (
        <form action={verifyAction} noValidate className="space-y-3">
          <label htmlFor="code" className="block text-sm font-medium text-slate-700">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? "code-error" : undefined}
            className={`block w-full rounded-lg border bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] text-ink shadow-sm outline-none focus:ring-2 ${
              codeError ? "border-rose-400 focus:ring-rose-500/20" : "border-line focus:border-brand-500 focus:ring-brand-500/20"
            }`}
          />
          {codeError && (
            <p id="code-error" className="text-xs text-rose-600">
              {codeError}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
          >
            {verifying && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {verifying ? "Verifying…" : "Verify email"}
          </button>
        </form>
      )}

      <form action={resendAction}>
        <button
          type="submit"
          disabled={resending}
          className={
            canEnterCode
              ? "w-full text-center text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
              : "flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-70"
          }
        >
          {resending ? "Sending…" : canEnterCode ? "Send a new code" : "Send verification code"}
        </button>
      </form>

      {resendState.message && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
            resendState.status === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {resendState.status === "error" ? (
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {resendState.message}
        </p>
      )}
    </div>
  );
}
