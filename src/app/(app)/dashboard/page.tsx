import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Upload, ListChecks, FileDown, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { describeAction, formatDateTime } from "@/lib/format";
import { PageHeader, buttonPrimary } from "@/components/app/page-header";
import { describeDue, todayIst } from "@/lib/compliance/dates";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const firmId = session.firm.id;

  // Every figure on this page is a live count from this firm's own records.
  const today = todayIst();
  const [activeClients, archivedClients, reconciliations, recentActivity, dueTasks] = await Promise.all([
    db.client.count({ where: { firmId, status: "ACTIVE" } }),
    db.client.count({ where: { firmId, status: "ARCHIVED" } }),
    db.reconciliation.count({ where: { firmId } }),
    db.auditLog.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { actor: { select: { name: true } } },
    }),
    db.complianceTask.findMany({
      where: { firmId, status: { in: ["TODO", "IN_PROGRESS"] } },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: { id: true, title: true, dueDate: true, dueDateSource: true },
    }),
  ]);

  const firstName = session.user.name.split(/\s+/)[0];

  if (activeClients === 0 && archivedClients === 0) {
    return <Onboarding firstName={firstName} />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Overview of ${session.firm.name}`}
        actions={
          <Link href="/clients/new" className={buttonPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add client
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Active clients" value={activeClients} href="/clients" />
        <StatCard label="Archived clients" value={archivedClients} href="/clients?status=archived" />
        <StatCard label="GST reconciliations" value={reconciliations} href="/reconciliation" />
      </div>

      <section className="rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">Upcoming compliance</h2>
          <Link href="/compliance" className="text-sm font-medium text-brand-600 hover:text-brand-700">All tasks</Link>
        </div>
        {dueTasks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No open compliance tasks. Due dates come only from your workspace rules or manual entries.</p>
        ) : (
          <ul className="divide-y divide-line">
            {dueTasks.map((t) => {
              const overdue = t.dueDate < today;
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="text-ink">{t.title}</span>
                  <span className={`shrink-0 text-xs ${overdue ? "font-semibold text-rose-700" : "text-muted"}`}>
                    {describeDue(t.dueDate, today)}
                    <span className="ml-1 text-muted">· {t.dueDateSource === "RULE" ? "your rule" : "manual"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">Recent activity</h2>
        </div>
        {recentActivity.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-ink">
                  <span className="font-medium">{entry.actor?.name ?? "System"}</span>{" "}
                  <span className="text-slate-600">{describeAction(entry.action).toLowerCase()}</span>
                </span>
                <time className="shrink-0 text-xs text-muted" dateTime={entry.createdAt.toISOString()}>
                  {formatDateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
    >
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <p className="tabular text-3xl font-semibold text-ink">{value.toLocaleString("en-IN")}</p>
        <ArrowRight
          className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

const STEPS = [
  { icon: Building2, title: "Add your first client", body: "Business name and GSTIN — the GSTIN is checked as you save.", ready: true },
  { icon: Upload, title: "Upload GSTR-2B and purchase register", body: "Excel or CSV. You'll preview the column mapping first.", ready: true },
  { icon: ListChecks, title: "Review the matches", body: "Every match comes with the reason it was made.", ready: true },
  { icon: FileDown, title: "Export the report", body: "Excel and PDF built from the reviewed results.", ready: true },
];

function Onboarding({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome to Taxora, ${firstName}`}
        description="Your workspace is ready. Here's how a reconciliation comes together."
      />
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <ol className="space-y-6">
          {STEPS.map(({ icon: Icon, title, body, ready }, i) => (
            <li key={title} className="flex gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  i === 0 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-ink">
                  {i + 1}. {title}
                  {!ready && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Coming next
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 border-t border-line pt-6">
          <Link href="/clients/new" className={buttonPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add your first client
          </Link>
        </div>
      </div>
    </div>
  );
}
