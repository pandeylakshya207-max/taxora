import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { describeAction, formatDateTime } from "@/lib/format";
import { isIsoDate } from "@/lib/compliance/dates";
import { PageHeader, buttonSecondary } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Audit trail" };

const PAGE_SIZE = 50;
const ENTITY_LABEL: Record<string, string> = {
  Firm: "Workspace",
  User: "User",
  Client: "Client",
  Reconciliation: "Reconciliation",
  MatchResult: "Review decision",
  FollowUp: "Supplier follow-up",
  DueDateRule: "Due-date rule",
  ComplianceTask: "Compliance task",
  SupportTicket: "Support request",
};

type Props = { searchParams: Promise<{ entity?: string; actor?: string; from?: string; to?: string; page?: string }> };

/** IST calendar date -> UTC instant at the start of that day in India. */
const istStart = (iso: string) => new Date(`${iso}T00:00:00+05:30`);

function entityHref(entityType: string, entityId: string | null, details: Record<string, unknown> | null): string | null {
  if (!entityId) return null;
  if (entityType === "Client") return `/clients/${entityId}`;
  if (entityType === "Reconciliation") return `/reconciliation/${entityId}`;
  if (entityType === "MatchResult" && typeof details?.reconciliationId === "string") {
    return `/reconciliation/${details.reconciliationId}/results/${entityId}`;
  }
  return null;
}

/** Show change details compactly; IDs are left out because they mean nothing to a reader. */
function detailText(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details as Record<string, unknown>)
    .filter(([k, v]) => !/id$/i.test(k) && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 300);
}

export default async function AuditPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const canSeeAll = session.role !== "MEMBER";

  const members = canSeeAll
    ? await db.membership.findMany({ where: { firmId: session.firm.id }, select: { user: { select: { id: true, name: true } } } })
    : [];
  const entity = sp.entity && ENTITY_LABEL[sp.entity] ? sp.entity : undefined;
  const actor = canSeeAll ? (members.some((m) => m.user.id === sp.actor) ? sp.actor : undefined) : session.user.id;
  const from = sp.from && isIsoDate(sp.from) ? sp.from : undefined;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {
    firmId: session.firm.id,
    ...(entity && { entityType: entity }),
    ...(actor && { actorId: actor }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: istStart(from) }),
        ...(to && { lt: new Date(istStart(to).getTime() + 86_400_000) }),
      },
    }),
  };
  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const q = new URLSearchParams({ ...(entity && { entity }), ...(canSeeAll && actor && { actor }), ...(from && { from }), ...(to && { to }), page: String(p) });
    return `/audit?${q.toString()}`;
  };
  const input = "mt-1 block rounded-lg border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description={canSeeAll ? "Every recorded action in this workspace. Entries cannot be edited or deleted." : "Your own recorded actions. Owners and admins can see the whole workspace."}
      />

      <form action="/audit" className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          Record type
          <select name="entity" defaultValue={entity ?? ""} className={input}>
            <option value="">All</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {canSeeAll && (
          <label className="text-xs font-medium text-slate-700">
            Person
            <select name="actor" defaultValue={actor ?? ""} className={input}>
              <option value="">Everyone</option>
              {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-700">
          From
          <input type="date" name="from" defaultValue={from} className={input} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          To
          <input type="date" name="to" defaultValue={to} className={input} />
        </label>
        <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-surface">Apply</button>
      </form>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <History className="h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-600">No audit entries match these filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">When (IST)</th>
                  <th scope="col" className="px-4 py-3 font-medium">Who</th>
                  <th scope="col" className="px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="px-4 py-3 font-medium">Record</th>
                  <th scope="col" className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => {
                  const details = (e.details ?? null) as Record<string, unknown> | null;
                  const href = entityHref(e.entityType, e.entityId, details);
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDateTime(e.createdAt)}</td>
                      <td className="px-4 py-2.5 text-ink">{e.actor?.name ?? "System"}</td>
                      <td className="px-4 py-2.5 text-ink">{describeAction(e.action)}</td>
                      <td className="px-4 py-2.5">
                        {href ? (
                          <Link href={href} className="text-brand-600 hover:underline">{ENTITY_LABEL[e.entityType] ?? e.entityType}</Link>
                        ) : (
                          <span className="text-slate-600">{ENTITY_LABEL[e.entityType] ?? e.entityType}</span>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-2.5 text-xs text-slate-600">{detailText(e.details)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p className="tabular">{total.toLocaleString("en-IN")} entr{total === 1 ? "y" : "ies"}</p>
        {pages > 1 && (
          <div className="flex gap-2">
            {page > 1 && <Link href={link(page - 1)} className={buttonSecondary}>Previous</Link>}
            {page < pages && <Link href={link(page + 1)} className={buttonSecondary}>Next</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
