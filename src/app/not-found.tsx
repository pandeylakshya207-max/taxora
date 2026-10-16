import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 font-mono text-sm text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600">
        The link may be outdated, or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-700"
      >
        Go to home
      </Link>
    </main>
  );
}
