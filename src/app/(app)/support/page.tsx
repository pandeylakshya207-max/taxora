import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, LifeBuoy } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { createTicket } from "@/lib/support/actions";
import { TICKET_CATEGORIES, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL, ticketRef } from "@/lib/support/shared";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Support" };

type Props = { searchParams: Promise<{ error?: string }> };
const input = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export default async function SupportPage({ searchParams }: Props) {
  const session = await requireSession();
  const { error } = await searchParams;
  const tickets = await db.supportTicket.findMany({
    where: { firmId: session.firm.id, ...(session.role === "MEMBER" && { userId: session.user.id }) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true, updatedAt: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Support" description="Raise an issue or a question. Every request gets a reference you can quote." />
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />{error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <form action={createTicket} className="space-y-3 rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">New request</h2>
          <label className="block text-xs font-medium text-slate-700">
            Subject
            <input name="subject" required minLength={5} maxLength={150} className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Category
              <select name="category" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Priority
              <select name="priority" defaultValue="NORMAL" className={input}>
                {Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-700">
            What happened?
            <textarea name="description" required minLength={20} maxLength={5000} rows={6} className={input} placeholder="What you were doing, what you expected, and what happened instead. Please don't include passwords or full bank details." />
          </label>
          <SubmitButton pendingText="Submitting…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
            Submit request
          </SubmitButton>
          <p className="text-xs text-muted">
            Requests are saved in Taxora with a reference number.
            {process.env.SUPPORT_EMAIL ? " A copy is also emailed to the support mailbox." : " No external support mailbox is configured, so nobody outside your workspace is notified yet."}
          </p>
        </form>

        <section className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">{session.role === "MEMBER" ? "Your requests" : "Workspace requests"}</h2>
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <LifeBuoy className="h-6 w-6 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm text-slate-600">No support requests yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/support/${t.id}`} className="block px-5 py-3 hover:bg-surface">
                    <p className="text-sm font-medium text-ink">{t.subject}</p>
                    <p className="text-xs text-muted">
                      <span className="font-mono">{ticketRef(t.number)}</span> · {TICKET_STATUS_LABEL[t.status]} · {TICKET_PRIORITY_LABEL[t.priority]} · {formatDateTime(t.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
