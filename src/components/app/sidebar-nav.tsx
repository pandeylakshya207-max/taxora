"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GitCompare,
  CalendarCheck,
  FileDown,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

type NavItem = { label: string; href: string; icon: LucideIcon; ready: boolean };

/**
 * Items marked ready:false are shown as "Soon" and are not links,
 * so nothing in the navigation pretends to work before it does.
 */
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, ready: true },
  { label: "Clients", href: "/clients", icon: Users, ready: true },
  { label: "Reconciliation", href: "/reconciliation", icon: GitCompare, ready: true },
  { label: "Compliance", href: "/compliance", icon: CalendarCheck, ready: false },
  { label: "Reports", href: "/reports", icon: FileDown, ready: false },
];

const SECONDARY: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings, ready: false },
  { label: "Support", href: "/support", icon: LifeBuoy, ready: false },
];

export function SidebarNav({ variant = "sidebar" }: { variant?: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "bar") {
    // Compact horizontal nav for small screens: only working destinations.
    return (
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
        {[...NAV, ...SECONDARY]
          .filter((item) => item.ready)
          .map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                isActive(href) ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
      <NavGroup items={NAV} isActive={isActive} />
      <div className="mt-auto">
        <NavGroup items={SECONDARY} isActive={isActive} />
      </div>
    </nav>
  );
}

function NavGroup({ items, isActive }: { items: NavItem[]; isActive: (href: string) => boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ label, href, icon: Icon, ready }) => (
        <li key={href}>
          {ready ? (
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="Not available yet"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
              <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Soon
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
