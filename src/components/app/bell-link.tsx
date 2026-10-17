"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

/**
 * Notification bell. The shared layout is kept by the browser between pages,
 * so the server-rendered count can go stale (e.g. after an automation or a
 * reconciliation creates notifications). The count is re-read from the server
 * whenever the user moves to another page — no timers, no polling.
 */
export function BellLink({ initial }: { initial: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initial);

  useEffect(() => setUnread(initial), [initial]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications/unread", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unread?: unknown } | null) => {
        if (d && typeof d.unread === "number") setUnread(d.unread);
      })
      .catch(() => {
        // Network hiccup or navigation away: keep the last known count.
      });
    return () => controller.abort();
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
