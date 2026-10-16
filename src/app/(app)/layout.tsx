import { Suspense } from "react";
import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { requireSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

/**
 * Shell for every signed-in page.
 *
 * The frame (sidebar, top bar outline) contains no request data, so Next.js can
 * prerender it and show it instantly on every navigation. Everything that needs
 * the session — the user menu and the page itself — streams in inside Suspense.
 * Access is still enforced on the server: <AuthGate> runs requireSession()
 * before any page content is rendered, and every page/action re-checks it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-navy-900 px-3 py-5 lg:flex">
        <div className="px-3">
          <Logo tone="light" href="/dashboard" />
        </div>
        <div className="mt-8 flex flex-1 flex-col">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="bg-navy-900 px-4 pb-2 pt-3 lg:hidden">
          <Logo tone="light" href="/dashboard" />
          <div className="mt-3">
            <SidebarNav variant="bar" />
          </div>
        </div>

        <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4 sm:px-6">
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <Suspense fallback={<PageSkeleton />}>
              <AuthGate>{children}</AuthGate>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Blocks page content until the session is confirmed (redirects otherwise). */
async function AuthGate({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <>{children}</>;
}

async function UserMenu() {
  // Same request-scoped cached lookup as AuthGate: no extra database call.
  const session = await requireSession();
  const unread = await db.notification.count({
    where: { userId: session.user.id, firmId: session.firm.id, readAt: null },
  });
  const initials = session.user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <>
      <p className="truncate text-sm font-medium text-slate-700">{session.firm.name}</p>
      <div className="flex items-center gap-3">
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
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-ink">{session.user.name}</p>
          <p className="text-xs leading-tight text-muted">{session.role.toLowerCase()}</p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
        >
          {initials || "?"}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}

function UserMenuSkeleton() {
  return (
    <>
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-72 animate-pulse rounded bg-slate-200/80" />
      <div className="h-48 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}

// The user menu and the auth gate read the session cookie, so this layout is
// request-specific by design (Next.js docs: use this for auth gating in a layout).
// Pages below still get instant loading skeletons from loading.tsx.
export const instant = false;
