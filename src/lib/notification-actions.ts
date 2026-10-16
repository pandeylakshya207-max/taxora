"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";

/** Mark one notification read and go to what it refers to. Only the owner can touch it. */
export async function openNotification(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const n = await db.notification.findFirst({
    where: { id, userId: session.user.id, firmId: session.firm.id },
    select: { id: true, href: true, readAt: true },
  });
  if (!n) redirect("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  // Only internal links are followed.
  redirect(n.href && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/notifications");
}

export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  await db.notification.updateMany({
    where: { userId: session.user.id, firmId: session.firm.id, readAt: null },
    data: { readAt: new Date() },
  });
  redirect("/notifications");
}
