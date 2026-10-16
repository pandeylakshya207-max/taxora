import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleAlert, CircleCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { addTicketMessage, setTicketStatus } from "@/lib/support/actions";
import { TICKET_CATEGORIES, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL, ticketRef } from "@/lib/support/shared";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Support request" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; error?: string }> };

export default async function TicketPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const ticket = await db.supportTicket.findFirst({
    where: { id, firmId: session.firm.id, ...(session.role === "MEMBER" && { userId: session.user.id }) },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  const authorIds = [...new Set([ticket.userId, ...ticket.messages.map((m) => m.authorId)])];
  const users = await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const name = (uid: string) => users.find((u) => u.id === uid)?.name ?? "Someone";
  const canChange = ticket.userId === session.user.id || session.role !== "MEMBER";
  const ref = ticketRef(ticket.number);

  return (
    <div className="space-y-6">
      <Link href="/support" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Support
      </Link>
      {sp.created === "1" && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Request saved with reference <strong className="font-mono">{ref}</strong>.
            {ticket.emailedAt ? " A copy was emailed to the support mailbox." : process.env.SUPPORT_EMAIL ? " The copy to the support mailbox could not be sent; the request is still saved here." : ""}
          </span>
        </div>
      )}
      {sp.error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />{sp.error}
        </div>
      )}

      <PageHeader
        title={ticket.subject}
        description={`${ref} · ${TICKET_CATEGORIES.find((c) => c.value === ticket.category)?.label ?? ticket.category} · ${TICKET_PRIORITY_LABEL[ticket.priority]} priority`}
        actions={<span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{TICKET_STATUS_LABEL[ticket.status]}</span>}
      />

      <ol className="space-y-3">
        <li className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs text-muted">{name(ticket.userId)} · {formatDateTime(ticket.createdAt)}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>
        </li>
        {ticket.messages.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-muted">{name(m.authorId)} · {formatDateTime(m.createdAt)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{m.body}</p>
          </li>
        ))}
      </ol>

      {ticket.status !== "CLOSED" && (
        <form action={addTicketMessage} className="space-y-3 rounded-xl border border-line bg-white p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <label htmlFor="body" className="block text-sm font-medium text-slate-700">Add a message</label>
          <textarea id="body" name="body" rows={4} required minLength={2} maxLength={5000} className="block w-full rounded-lg border border-line px-3 py-2 text-sm" />
          <SubmitButton pendingText="Sending…" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
            Add message
          </SubmitButton>
        </form>
      )}

      {canChange && (
        <div className="flex flex-wrap gap-2">
          {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && <StatusButton id={ticket.id} status="RESOLVED" label="Mark resolved" />}
          {ticket.status !== "CLOSED" && <StatusButton id={ticket.id} status="CLOSED" label="Close request" />}
          {(ticket.status === "RESOLVED" || ticket.status === "CLOSED") && <StatusButton id={ticket.id} status="OPEN" label="Reopen" />}
        </div>
      )}
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setTicketStatus}>
      <input type="hidden" name="ticketId" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton pendingText="…" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-60">
        {label}
      </SubmitButton>
    </form>
  );
}
