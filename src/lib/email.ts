import "server-only";

/**
 * Outgoing email via Resend's HTTP API (https://resend.com).
 *
 * Required in production:
 *   RESEND_API_KEY   — from the Resend dashboard
 *   EMAIL_FROM       — e.g. "Taxora <no-reply@yourdomain.com>" on a verified domain
 *
 * Honesty rule: this never reports an email as sent unless Resend accepted it.
 * In development without a key, the caller is told delivery is not configured
 * so it can print the code to the server terminal, clearly labelled.
 */

export type EmailResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "provider_error" };

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { delivered: false, reason: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Taxora <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Log status and provider message, never the API key or the email body.
      const detail = await res.text().catch(() => "");
      console.error("[email] provider rejected message", { status: res.status, detail: detail.slice(0, 300) });
      return { delivered: false, reason: "provider_error" };
    }
    return { delivered: true };
  } catch (error) {
    console.error("[email] request failed", error);
    return { delivered: false, reason: "provider_error" };
  }
}
