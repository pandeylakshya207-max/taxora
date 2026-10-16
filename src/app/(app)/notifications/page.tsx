import type { Metadata } from "next";
import { Bell, CheckCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { markAllRead, openNotification } from "@/lib/notification-actions";
import { PageHeader, buttonSecondary } from "@/components/app/page-header";
import { SubmitButton } from "../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Notifications" };

type Props = { searchParams: Promise<{ show?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const session = await requireSession();
  const { show } = await searchParams;
  const unreadOnly = show === "unread";
  const where = { userId: session.user.id, firmId: session.firm.id, ...(unreadOnly && { readAt: null }) };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.notification.count({ where: { userId: session.user.id, firmId: session.firm.id, readAt: null } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          <>
            <a href={unreadOnly ? "/notifications" : "/notifications?show=unread"} className={buttonSecondary}>
              {unreadOnly ? "Show all" : "Unread only"}
            </a>
            {unread > 0 && (
              <form action={markAllRead}>
                <SubmitButton pendingText="Marking…" className={buttonSecondary}>
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  Mark all read
                </SubmitButton>
              </form>
            )}
          </>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <Bell className="h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-600">{unreadOnly ? "No unread notifications." : "No notifications yet. Completed reconciliations, import problems and finalisations will appear here."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.readAt ? "text-slate-700" : "font-semibold text-ink"}`}>
                      {n.title}
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="block whitespace-pre-line text-sm text-slate-600">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
