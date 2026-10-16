import Link from "next/link";
import {
  ArrowRight,
  FileSpreadsheet,
  GitCompare,
  ScrollText,
  Sparkles,
  FileDown,
  ShieldCheck,
  Upload,
  ListChecks,
  FileCheck,
  Lock,
  History,
  KeyRound,
  Building2,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ProductPreview } from "@/components/marketing/product-preview";

const FEATURES = [
  {
    icon: GitCompare,
    title: "Layered matching engine",
    body: "Exact, fuzzy and probable matching across GSTIN, invoice number, date and value — with thresholds your firm controls.",
  },
  {
    icon: ScrollText,
    title: "Every result explained",
    body: "See the original values, the normalised values, the score breakdown and the reason a record was classified the way it was.",
  },
  {
    icon: FileSpreadsheet,
    title: "Imports that don't break",
    body: "Excel and CSV with automatic column mapping, a preview before processing and row-level errors — nothing dropped silently.",
  },
  {
    icon: FileCheck,
    title: "Controlled ITC review",
    body: "Review notes, approval status and an explicit finalisation step, with the reviewer and timestamp recorded.",
  },
  {
    icon: Sparkles,
    title: "AI that shows its work",
    body: "Plain-language explanations of discrepancies and draft supplier follow-ups — clearly marked as suggestions for your judgement.",
  },
  {
    icon: FileDown,
    title: "Client-ready reports",
    body: "Excel workbooks and branded PDFs built from the exact client, period and filters you selected.",
  },
];

const STEPS = [
  {
    icon: Building2,
    title: "Add the client",
    body: "GSTIN validated on entry, duplicates caught before they're saved.",
  },
  {
    icon: Upload,
    title: "Upload both sources",
    body: "GSTR-2B and the purchase register. Preview the mapping before anything runs.",
  },
  {
    icon: ListChecks,
    title: "Review the results",
    body: "Filter by category, open any invoice, accept or correct proposed matches.",
  },
  {
    icon: FileDown,
    title: "Finalise and export",
    body: "Sign off with a recorded approval and send the client a clean report.",
  },
];

const SCORE = [
  { label: "GSTIN", weight: 40 },
  { label: "Invoice number", weight: 30 },
  { label: "Amount", weight: 20 },
  { label: "Date proximity", weight: 10 },
];

const TRUST = [
  {
    icon: Lock,
    title: "Firm-level isolation",
    body: "Every query is scoped to your firm on the server. Changing an ID in a request does not reveal another firm's data.",
  },
  {
    icon: History,
    title: "Complete audit trail",
    body: "Uploads, match changes, review decisions and finalisation are recorded with who, what and when.",
  },
  {
    icon: KeyRound,
    title: "Keys stay server-side",
    body: "AI and integration credentials never reach the browser, logs or error messages.",
  },
  {
    icon: ShieldCheck,
    title: "Source data untouched",
    body: "Imported values are preserved exactly as uploaded. Corrections are recorded alongside, never over them.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="transition-colors hover:text-ink">Product</a>
            <a href="#workflow" className="transition-colors hover:text-ink">Workflow</a>
            <a href="#matching" className="transition-colors hover:text-ink">Matching</a>
            <a href="#security" className="transition-colors hover:text-ink">Security</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ───────── Hero ───────── */}
        <section className="relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                Built for CAs and finance teams in India
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-navy-900 sm:text-5xl">
                GST reconciliation you can{" "}
                <span className="text-brand-600">explain to a client.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Taxora matches GSTR-2B against the purchase register, flags every discrepancy, and
                shows exactly why each invoice landed where it did — so review takes minutes, not
                a weekend.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login?mode=signup"
                  className="group inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  Start reconciling
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                >
                  See how it works
                </a>
              </div>
              <ul className="mt-10 grid max-w-lg grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2">
                {[
                  "Exact, fuzzy & probable matching",
                  "CGST, SGST, IGST & cess kept separate",
                  "Paise-accurate arithmetic",
                  "Excel & PDF exports",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>

        {/* ───────── Features ───────── */}
        <section id="features" className="scroll-mt-20 border-t border-line bg-surface py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-600">Product</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy-900">
                Everything a reconciliation needs. Nothing it doesn't.
              </h2>
              <p className="mt-4 text-slate-600">
                Designed around how practitioners actually review GST data: evidence first,
                decisions recorded, nothing hidden behind a score.
              </p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-white p-7">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Workflow ───────── */}
        <section id="workflow" className="scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-600">Workflow</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy-900">
                From two spreadsheets to a signed-off report.
              </h2>
            </div>
            <ol className="mt-14 grid gap-6 md:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="relative rounded-2xl border border-line p-6">
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-navy-700" aria-hidden="true" />
                    <span className="tabular font-mono text-xs text-slate-400">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── Matching transparency ───────── */}
        <section id="matching" className="scroll-mt-20 bg-navy-900 py-24 text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-brand-400">Explainable matching</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                A score you can read, not a black box.
              </h2>
              <p className="mt-4 leading-relaxed text-slate-300">
                Each proposed match carries its full breakdown. Weights and thresholds are your
                firm&apos;s settings, not hidden constants — and a high score never overrides
                conflicting tax values. Those go to manual review.
              </p>
              <p className="mt-6 text-sm text-slate-400">
                A match is evidence for review. It is not a determination of ITC eligibility.
              </p>
            </div>
            <div className="rounded-2xl border border-navy-700 bg-navy-800 p-7">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Default score weights · configurable
              </p>
              <ul className="mt-6 space-y-5">
                {SCORE.map(({ label, weight }) => (
                  <li key={label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-200">{label}</span>
                      <span className="tabular font-mono text-slate-300">{weight}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-700">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${weight * 2.5}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-7 grid grid-cols-3 gap-3 border-t border-navy-700 pt-6 text-center text-xs">
                <div>
                  <p className="font-semibold text-emerald-400">Exact</p>
                  <p className="mt-1 text-slate-400">All key fields agree</p>
                </div>
                <div>
                  <p className="font-semibold text-sky-400">Fuzzy</p>
                  <p className="mt-1 text-slate-400">≥ 85% invoice no., ≤ 5% value</p>
                </div>
                <div>
                  <p className="font-semibold text-amber-400">Probable</p>
                  <p className="mt-1 text-slate-400">≤ 2% value, ≤ 7 days</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Security ───────── */}
        <section id="security" className="scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-600">Security & integrity</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy-900">
                Your clients&apos; financial data, handled like it matters.
              </h2>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {TRUST.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-line p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── CTA ───────── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-600 px-8 py-14 text-center sm:px-16">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Bring this month&apos;s reconciliation into Taxora.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">
              Add a client, upload two files, and see the first results with every match explained.
            </p>
            <Link
              href="/login?mode=signup"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <Logo />
            <nav aria-label="Footer" className="flex flex-wrap gap-6 text-sm text-slate-600">
              <a href="#features" className="hover:text-ink">Product</a>
              <a href="#workflow" className="hover:text-ink">Workflow</a>
              <a href="#security" className="hover:text-ink">Security</a>
              <Link href="/login" className="hover:text-ink">Sign in</Link>
            </nav>
          </div>
          <p className="mt-8 max-w-3xl text-xs leading-relaxed text-slate-500">
            Taxora is a reconciliation and review tool. It does not file returns or transmit data
            to the GST portal, and its matches and AI suggestions are not a determination of input
            tax credit eligibility. Tax decisions require qualified professional review.
          </p>
          <p className="mt-4 text-xs text-slate-400">© Taxora</p>
        </div>
      </footer>
    </div>
  );
}
