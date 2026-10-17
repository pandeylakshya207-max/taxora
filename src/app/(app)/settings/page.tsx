import type { Metadata } from "next";
import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { resolveReconConfig } from "@/lib/recon/config";
import { DEFAULT_CONFIG } from "@/lib/recon/engine";
import { isEmailConfigured } from "@/lib/email";
import { NOTIFICATION_KINDS } from "@/lib/notification-kinds";
import {
  changePassword,
  resetReconSettings,
  signOutOtherSessions,
  updateNotificationPrefs,
  updateProfile,
  updateReconSettings,
  updateWorkspace,
} from "@/lib/settings/actions";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "../reconciliation/[id]/submit-button";

export const metadata: Metadata = { title: "Settings" };

type Props = { searchParams: Promise<{ section?: string; saved?: string; error?: string }> };

const input = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm disabled:bg-surface disabled:text-muted";
const primary = "inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60";
const secondary = "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60";

export default async function SettingsPage({ searchParams }: Props) {
  const session = await requireSession();
  const sp = await searchParams;
  const canAdmin = session.role !== "MEMBER";

  const [firm, membership, sessionCount] = await Promise.all([
    db.firm.findUnique({ where: { id: session.firm.id }, select: { name: true, kind: true, reconConfig: true } }),
    db.membership.findUnique({ where: { firmId_userId: { firmId: session.firm.id, userId: session.user.id } }, select: { mutedNotifications: true } }),
    db.session.count({ where: { userId: session.user.id, expiresAt: { gt: new Date() } } }),
  ]);
  const config = resolveReconConfig(firm?.reconConfig);
  const isDefault = JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG);
  const muted = new Set(membership?.mutedNotifications ?? []);

  const status = (section: string) =>
    sp.section === section ? (
      sp.error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />{sp.error}
        </p>
      ) : sp.saved ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />Saved.
        </p>
      ) : null
    ) : null;

  const integrations = [
    {
      name: "Email delivery (Resend)",
      configured: isEmailConfigured(),
      used: "Verification codes and support-ticket copies.",
      next: "Add RESEND_API_KEY (and EMAIL_FROM on a verified domain) to the server's environment, then restart.",
    },
    {
      name: "AI assistance (Anthropic)",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      used: "Plain-language explanations of discrepancies.",
      next: "Add ANTHROPIC_API_KEY to the server's environment, then restart. Keys are only ever used on the server.",
    },
    {
      name: "Support mailbox",
      configured: Boolean(process.env.SUPPORT_EMAIL) && isEmailConfigured(),
      used: "Emails a copy of each new support ticket to your support team.",
      next: "Set SUPPORT_EMAIL (and email delivery above). Tickets are always saved in Taxora either way.",
    },
    {
      name: "GST portal",
      configured: false,
      used: "Not supported. Taxora does not connect to the GST portal or file returns.",
      next: null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, security, workspace and notification preferences." />

      <Section id="profile" title="Profile" status={status("profile")}>
        <form key={session.user.name} action={updateProfile} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">
            Name
            <input name="name" defaultValue={session.user.name} required maxLength={80} className={input} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Email <span className="font-normal text-muted">(verified; cannot be changed here yet)</span>
            <input value={session.user.email} disabled className={input} readOnly />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Saving…" className={primary}>Save profile</SubmitButton>
          </div>
        </form>
      </Section>

      <Section id="security" title="Security" status={status("security")}>
        <form action={changePassword} className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-700">
            Current password
            <input type="password" name="current" autoComplete="current-password" required className={input} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            New password
            <input type="password" name="next" autoComplete="new-password" minLength={10} required className={input} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Confirm new password
            <input type="password" name="confirm" autoComplete="new-password" minLength={10} required className={input} />
          </label>
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Changing…" className={primary}>Change password</SubmitButton>
            <p className="mt-2 text-xs text-muted">Changing your password signs you out everywhere else.</p>
          </div>
        </form>
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">You have {sessionCount} active session{sessionCount === 1 ? "" : "s"}, including this one.</p>
          {sessionCount > 1 && (
            <form action={signOutOtherSessions}>
              <SubmitButton pendingText="Signing out…" className={secondary}>Sign out other sessions</SubmitButton>
            </form>
          )}
        </div>
      </Section>

      <Section id="workspace" title="Workspace" status={status("workspace")}>
        <form key={`${firm?.name}|${firm?.kind}`} action={updateWorkspace} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">
            Workspace name
            <input name="name" defaultValue={firm?.name} required maxLength={120} disabled={!canAdmin} className={input} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Type
            <select name="kind" defaultValue={firm?.kind} disabled={!canAdmin} className={input}>
              <option value="CA_PRACTICE">CA / tax practice</option>
              <option value="COMPANY">Company finance team</option>
              <option value="INDIVIDUAL">Independent professional</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            {canAdmin ? (
              <SubmitButton pendingText="Saving…" className={primary}>Save workspace</SubmitButton>
            ) : (
              <p className="text-xs text-muted">Only owners and admins can change workspace details.</p>
            )}
          </div>
        </form>
      </Section>

      <Section id="matching" title="Matching rules" status={status("matching")}>
        <p className="mb-4 text-sm text-slate-600">
          Used for new reconciliation runs. Each run keeps the exact settings it used, so earlier results stay explainable.
          {isDefault ? " These are the defaults." : " These differ from the defaults."}
        </p>
        {/* key: when the saved values change (e.g. after "Reset to defaults"), the
            inputs are recreated so they show the saved values, not stale typing. */}
        <form key={JSON.stringify(config)} action={updateReconSettings} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Num name="tolerance" label="Rounding tolerance per amount (₹)" value={config.roundingTolerancePaise / 100} step="0.01" min={0} max={100} disabled={!canAdmin} />
          <Num name="similarity" label="Fuzzy: invoice-number similarity at least (%)" value={Math.round(config.fuzzy.minInvoiceSimilarity * 100)} step="1" min={60} max={100} disabled={!canAdmin} />
          <Num name="fuzzyValue" label="Fuzzy: value within (%)" value={config.fuzzy.maxValueDiffPct} step="0.1" min={0} max={20} disabled={!canAdmin} />
          <Num name="probableValue" label="Probable: value within (%)" value={config.probable.maxValueDiffPct} step="0.1" min={0} max={10} disabled={!canAdmin} />
          <Num name="probableDays" label="Probable: dates within (days)" value={config.probable.maxDateDiffDays} step="1" min={0} max={60} disabled={!canAdmin} />
          <div className="text-xs text-slate-600 sm:col-span-2 lg:col-span-1">
            <p className="font-medium text-slate-700">Score weights (fixed)</p>
            <p className="mt-1">GSTIN {config.weights.gstin} · invoice no. {config.weights.invoiceNo} · amount {config.weights.amount} · date {config.weights.date}</p>
          </div>
          {canAdmin && (
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              <SubmitButton pendingText="Saving…" className={primary}>Save matching rules</SubmitButton>
            </div>
          )}
        </form>
        {canAdmin && !isDefault && (
          <form action={resetReconSettings} className="mt-2">
            <SubmitButton pendingText="Resetting…" className={secondary}>Reset to defaults</SubmitButton>
          </form>
        )}
        {!canAdmin && <p className="mt-3 text-xs text-muted">Only owners and admins can change matching rules.</p>}
      </Section>

      <Section id="notifications" title="Notifications" status={status("notifications")}>
        <form key={[...muted].sort().join(",")} action={updateNotificationPrefs} className="space-y-3">
          {NOTIFICATION_KINDS.map((k) => (
            <label key={k.kind} className="flex items-start gap-3">
              <input type="checkbox" name="enabled" value={k.kind} defaultChecked={!muted.has(k.kind)} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium text-ink">{k.label}</span>
                <span className="block text-xs text-muted">{k.help}</span>
              </span>
            </label>
          ))}
          <SubmitButton pendingText="Saving…" className={primary}>Save preferences</SubmitButton>
          <p className="text-xs text-muted">These control in-app notifications for you only. Taxora does not send notification emails yet.</p>
        </form>
      </Section>

      <Section id="integrations" title="Integrations" status={null}>
        <ul className="divide-y divide-line">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-start gap-3 py-3">
              {i.configured ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-medium text-ink">
                  {i.name} <span className={`ml-1 text-xs font-normal ${i.configured ? "text-emerald-700" : "text-muted"}`}>{i.configured ? "Connected" : i.next ? "Not configured" : "Not available"}</span>
                </p>
                <p className="text-xs text-slate-600">{i.used}</p>
                {!i.configured && i.next && <p className="mt-0.5 text-xs text-slate-500">Next step: {i.next}</p>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Status is read from the server configuration. Keys are never shown or sent to the browser.</p>
      </Section>
    </div>
  );
}

function Section({ id, title, status, children }: { id: string; title: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-semibold text-ink">{title}</h2>
      {status && <div className="mt-3">{status}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Num({ name, label, value, step, min, max, disabled }: { name: string; label: string; value: number; step: string; min: number; max: number; disabled: boolean }) {
  return (
    <label className="text-xs font-medium text-slate-700">
      {label}
      <input type="number" name={name} defaultValue={value} step={step} min={min} max={max} required disabled={disabled} className={input} />
    </label>
  );
}
