import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email. Two ways to deliver, checked in this order:
 *
 * 1. SMTP — e.g. a Gmail account with an App Password (no domain needed):
 *      SMTP_USER   your.address@gmail.com
 *      SMTP_PASS   16-character Google App Password (not your normal password)
 *      SMTP_HOST   optional, default smtp.gmail.com
 *      SMTP_PORT   optional, default 465 (TLS)
 *      SMTP_FROM   optional, default "Taxora <SMTP_USER>"
 *
 * 2. Resend's HTTP API (https://resend.com):
 *      RESEND_API_KEY, EMAIL_FROM on a verified domain
 *
 * Honesty rule: this never reports an email as sent unless the provider accepted
 * it. Secrets and message bodies are never logged.
 */

export type EmailResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "provider_error" };

const smtpConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

export function isEmailConfigured() {
  return smtpConfigured() || resendConfigured();
}

/** Which provider is active, for the Settings page. */
export function emailProvider(): "SMTP" | "Resend" | null {
  return smtpConfigured() ? "SMTP" : resendConfigured() ? "Resend" : null;
}

const globalForMail = globalThis as unknown as { taxoraSmtp?: Transporter };

function smtp(): Transporter {
  if (!globalForMail.taxoraSmtp) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    globalForMail.taxoraSmtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return globalForMail.taxoraSmtp;
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<EmailResult> {
  if (smtpConfigured()) {
    try {
      await smtp().sendMail({
        // Gmail only sends as the signed-in address, so EMAIL_FROM (a Resend setting) is not used here.
        from: process.env.SMTP_FROM || `Taxora <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });
      return { delivered: true };
    } catch (error) {
      const e = error as { code?: string; responseCode?: number };
      console.error("[email] SMTP send failed", { code: e?.code, responseCode: e?.responseCode });
      return { delivered: false, reason: "provider_error" };
    }
  }

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
      const detail = await res.text().catch(() => "");
      console.error("[email] provider rejected message", { status: res.status, detail: detail.slice(0, 300) });
      return { delivered: false, reason: "provider_error" };
    }
    return { delivered: true };
  } catch (error) {
    console.error("[email] request failed", error instanceof Error ? error.name : "unknown");
    return { delivered: false, reason: "provider_error" };
  }
}
