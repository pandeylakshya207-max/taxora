import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { requireSignedIn } from "@/lib/auth/session";
import { hasActiveCode } from "@/lib/auth/otp";
import { isEmailConfigured } from "@/lib/email";
import { signOut } from "@/lib/auth/actions";
import { VerifyForms } from "./verify-forms";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-surface" />}>
            <VerifyPanel />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function VerifyPanel() {
  const session = await requireSignedIn();
  if (session.user.emailVerified) redirect("/dashboard");

  const [active] = await Promise.all([hasActiveCode(session.user.id)]);
  const emailConfigured = isEmailConfigured();

  return (
    <>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <MailCheck className="h-5 w-5" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-navy-900">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-600">
        {active ? "Enter the 6-digit code we sent to " : "We need to confirm that "}
        <span className="font-medium text-ink">{session.user.email}</span>
        {active ? "." : " belongs to you. Send yourself a code to continue."}
      </p>

      {!emailConfigured && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Email delivery isn&apos;t configured on this server yet.
          {process.env.NODE_ENV === "development"
            ? " Development mode: the code is printed in the terminal running the app."
            : " Codes cannot be sent until RESEND_API_KEY is set."}
        </p>
      )}

      <VerifyForms hasActiveCode={active} />

      <form action={signOut} className="mt-6 border-t border-line pt-4 text-center">
        <button type="submit" className="text-xs text-slate-500 hover:text-ink">
          Wrong email? Sign out
        </button>
      </form>
    </>
  );
}
