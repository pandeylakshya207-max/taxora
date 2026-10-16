import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ mode?: string }> };

export default function LoginPage({ searchParams }: Props) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — static, prerendered */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <Logo tone="light" className="relative" />
        <div className="relative max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight">
            Every match explained. Every decision recorded.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Reconcile GSTR-2B with the purchase register, review discrepancies with your team,
            and hand clients a report you can stand behind.
          </p>
        </div>
        <p className="relative text-xs text-slate-500">
          Taxora does not file returns or connect to the GST portal.
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="lg:hidden" />
          {/* Reading the URL and the session cookie is request-time work */}
          <Suspense fallback={<div className="mt-8 h-80 animate-pulse rounded-xl bg-surface lg:mt-0" />}>
            <AuthPanel searchParams={searchParams} />
          </Suspense>
          <p className="mt-10 text-center">
            <Link href="/" className="text-xs text-slate-500 hover:text-ink">
              ← Back to Taxora home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

async function AuthPanel({ searchParams }: Props) {
  if (await getSession()) redirect("/dashboard");

  const { mode } = await searchParams;
  const isSignup = mode === "signup";

  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-navy-900 lg:mt-0">
        {isSignup ? "Create your Taxora workspace" : "Sign in to Taxora"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {isSignup
          ? "For CA practices, company finance teams and independent professionals."
          : "Welcome back. Sign in with your email to continue."}
      </p>

      {/* key forces a fresh form state when switching modes */}
      <AuthForm key={isSignup ? "signup" : "signin"} mode={isSignup ? "signup" : "signin"} />

      <p className="mt-6 text-center text-sm text-slate-600">
        {isSignup ? "Already have a workspace? " : "New to Taxora? "}
        <Link
          href={isSignup ? "/login" : "/login?mode=signup"}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </>
  );
}
