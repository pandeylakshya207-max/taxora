import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

/**
 * Email verification codes.
 * - 6 digits from a cryptographic RNG
 * - only a hash is stored
 * - single use, 10-minute expiry, 5 attempts, 60-second resend cooldown
 * - issuing a new code invalidates any older unused code
 */

const TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export type IssueResult =
  | { ok: true; delivery: "email" | "dev_console" }
  | { ok: false; reason: "cooldown"; retryInSeconds: number }
  | { ok: false; reason: "delivery_failed" };

export async function issueVerificationCode(user: { id: string; email: string; name: string }): Promise<IssueResult> {
  const latest = await db.emailOtp.findFirst({
    where: { userId: user.id, purpose: "EMAIL_VERIFICATION" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest) {
    const waited = Date.now() - latest.createdAt.getTime();
    if (waited < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryInSeconds: Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000) };
    }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();

  await db.$transaction([
    // Older unused codes stop working the moment a new one is issued.
    db.emailOtp.updateMany({
      where: { userId: user.id, purpose: "EMAIL_VERIFICATION", consumedAt: null },
      data: { consumedAt: now },
    }),
    db.emailOtp.create({
      data: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        codeHash: hashCode(user.id, code),
        expiresAt: new Date(now.getTime() + TTL_MS),
      },
    }),
  ]);

  const firstName = user.name.split(/\s+/)[0];
  const result = await sendEmail(
    user.email,
    `${code} is your Taxora verification code`,
    `Hi ${firstName},\n\nYour Taxora verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    `<p>Hi ${escapeHtml(firstName)},</p><p>Your Taxora verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p><p>It expires in 10 minutes.</p><p style="color:#64748b">If you didn't request this, you can ignore this email.</p>`,
  );

  if (result.delivered) return { ok: true, delivery: "email" };

  if (result.reason === "not_configured" && process.env.NODE_ENV === "development") {
    // Development only: email is not set up, so show the code where only the developer can see it.
    console.info(`\n[DEV ONLY — email not configured] Verification code for ${user.email}: ${code}\n`);
    return { ok: true, delivery: "dev_console" };
  }

  return { ok: false, reason: "delivery_failed" };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; attemptsLeft: number }
  | { ok: false; reason: "expired" | "locked" | "none" };

export async function verifyCode(user: { id: string }, firmId: string, code: string): Promise<VerifyResult> {
  const otp = await db.emailOtp.findFirst({
    where: { userId: user.id, purpose: "EMAIL_VERIFICATION", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, reason: "none" };
  if (otp.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(user.id, code), "hex");
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    // Count the attempt atomically so parallel guesses can't bypass the limit.
    const updated = await db.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - updated.attempts);
    return attemptsLeft === 0 ? { ok: false, reason: "locked" } : { ok: false, reason: "invalid", attemptsLeft };
  }

  const now = new Date();
  await db.$transaction([
    // consumedAt: null in the filter makes the code single-use even under a double submit.
    db.emailOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: now } }),
    db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } }),
    db.auditLog.create({
      data: auditData({ firmId, actorId: user.id, action: "user.email_verified", entityType: "User", entityId: user.id }),
    }),
  ]);
  return { ok: true };
}

export async function hasActiveCode(userId: string) {
  const otp = await db.emailOtp.findFirst({
    where: { userId, purpose: "EMAIL_VERIFICATION", consumedAt: null, expiresAt: { gt: new Date() } },
    select: { attempts: true },
  });
  return Boolean(otp && otp.attempts < MAX_ATTEMPTS);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
