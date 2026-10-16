"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { TICKET_CATEGORIES, ticketRef } from "./shared";

const categories = TICKET_CATEGORIES.map((c) => c.value) as [string, ...string[]];

const ticketSchema = z.object({
  subject: z.string().trim().min(5, "Give the request a short subject.").max(150),
  category: z.enum(categories, "Choose a category."),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  description: z.string().trim().min(20, "Describe the issue in a little more detail (at least 20 characters).").max(5000),
});

export async function createTicket(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = ticketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/support?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  const d = parsed.data!;

  const ticket = await db.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: { firmId: session.firm.id, userId: session.user.id, ...d },
      select: { id: true, number: true },
    });
    await tx.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "support.ticket_created", entityType: "SupportTicket", entityId: t.id, details: { reference: ticketRef(t.number), category: d.category, priority: d.priority } }),
    });
    return t;
  });

  // Optional copy to a support mailbox. The ticket is already saved; the page
  // reports truthfully whether the email was accepted.
  const supportEmail = process.env.SUPPORT_EMAIL;
  if (supportEmail) {
    const ref = ticketRef(ticket.number);
    const result = await sendEmail(
      supportEmail,
      `[${ref}] ${d.subject}`,
      `Reference: ${ref}\nWorkspace: ${session.firm.name}\nFrom: ${session.user.name} <${session.user.email}>\nCategory: ${d.category}\nPriority: ${d.priority}\n\n${d.description}`,
      `<p><strong>Reference:</strong> ${ref}<br><strong>Workspace:</strong> ${escape(session.firm.name)}<br><strong>From:</strong> ${escape(session.user.name)} &lt;${escape(session.user.email)}&gt;<br><strong>Category:</strong> ${escape(d.category)}<br><strong>Priority:</strong> ${d.priority}</p><pre style="white-space:pre-wrap;font-family:inherit">${escape(d.description)}</pre>`,
    );
    if (result.delivered) await db.supportTicket.update({ where: { id: ticket.id }, data: { emailedAt: new Date() } });
  }
  redirect(`/support/${ticket.id}?created=1`);
}

export async function addTicketMessage(formData: FormData): Promise<void> {
  const session = await requireSession();
  const ticketId = String(formData.get("ticketId") ?? "");
  const parsed = z.string().trim().min(2, "Write a message first.").max(5000).safeParse(formData.get("body"));
  const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, firmId: session.firm.id }, select: { id: true, status: true } });
  if (!ticket) redirect("/support");
  if (!parsed.success) redirect(`/support/${ticket.id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid message.")}`);
  if (ticket.status === "CLOSED") redirect(`/support/${ticket.id}?error=${encodeURIComponent("This ticket is closed. Reopen it to add a message.")}`);
  await db.supportMessage.create({ data: { ticketId: ticket.id, authorId: session.user.id, body: parsed.data } });
  redirect(`/support/${ticket.id}`);
}

export async function setTicketStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = z.enum(["OPEN", "RESOLVED", "CLOSED"]).safeParse(formData.get("status"));
  const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, firmId: session.firm.id }, select: { id: true, status: true, userId: true } });
  if (!ticket || !status.success) redirect("/support");
  // The person who raised it, or a workspace owner/admin, can change its status.
  if (ticket.userId !== session.user.id && session.role === "MEMBER") {
    redirect(`/support/${ticket.id}?error=${encodeURIComponent("Only the person who raised this ticket or an admin can change its status.")}`);
  }
  await db.$transaction([
    db.supportTicket.update({ where: { id: ticket.id }, data: { status: status.data } }),
    db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "support.ticket_status", entityType: "SupportTicket", entityId: ticket.id, details: { from: ticket.status, to: status.data } }),
    }),
  ]);
  redirect(`/support/${ticket.id}`);
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
