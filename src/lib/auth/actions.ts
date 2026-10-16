"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { fieldErrorsFrom, isUniqueViolation, readFields, type FormState } from "@/lib/form";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, getSession, requireSignedIn } from "./session";
import { issueVerificationCode, verifyCode } from "./otp";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email.")
  .max(254, "Email is too long.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

// Not exported: a "use server" file may only export async functions.
const ACCOUNT_KINDS = ["CA_PRACTICE", "COMPANY", "INDIVIDUAL"] as const;

const signUpSchema = z.object({
  kind: z.enum(ACCOUNT_KINDS, "Choose who this workspace is for."),
  // Optional: falls back to the person's own name.
  firm: z.string().trim().max(120, "Workspace name is too long."),
  name: z.string().trim().min(2, "Enter your name.").max(80, "Name is too long."),
  email,
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(128, "Password is too long."),
});

const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(128),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readFields(formData, ["kind", "firm", "name", "email", "password"] as const);
  const values = { kind: raw.kind, firm: raw.firm, name: raw.name, email: raw.email };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  }
  const input = parsed.data;
  const workspaceName = input.firm.length >= 2 ? input.firm : input.name;
  const passwordHash = await hashPassword(input.password);

  let ids: { userId: string; firmId: string };
  try {
    // Firm, owner, membership and the audit entry are created together or not at all.
    ids = await db.$transaction(async (tx) => {
      const firm = await tx.firm.create({ data: { name: workspaceName, kind: input.kind } });
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      await tx.membership.create({ data: { firmId: firm.id, userId: user.id, role: "OWNER" } });
      await tx.auditLog.create({
        data: auditData({
          firmId: firm.id,
          actorId: user.id,
          action: "firm.created",
          entityType: "Firm",
          entityId: firm.id,
        }),
      });
      return { userId: user.id, firmId: firm.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { email: "An account with this email already exists. Sign in instead." },
        values,
      };
    }
    console.error("[auth.signUp] failed", error);
    return {
      status: "error",
      message: "We couldn't create your workspace. Nothing was saved — please try again.",
      values,
    };
  }

  await createSession(ids.userId, ids.firmId);
  // Account exists now. If sending the code fails, the verify page offers a resend.
  await issueVerificationCode({ id: ids.userId, email: input.email, name: input.name }).catch((error) => {
    console.error("[auth.signUp] could not issue verification code", error);
  });
  redirect("/verify");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = readFields(formData, ["email", "password"] as const);
  const values = { email: raw.email };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), values };
  }
  const { email: emailAddr, password } = parsed.data;

  const user = await db.user.findUnique({
    where: { email: emailAddr },
    select: {
      id: true,
      passwordHash: true,
      memberships: { select: { firmId: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });

  // Always run one hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  const firmId = user?.memberships[0]?.firmId;

  if (!user || !ok || !firmId) {
    return { status: "error", message: "Email or password is incorrect.", values };
  }

  await createSession(user.id, firmId);
  redirect("/dashboard");
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code from the email."),
});

export async function verifyEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSignedIn();
  if (session.user.emailVerified) redirect("/dashboard");

  const parsed = codeSchema.safeParse(readFields(formData, ["code"] as const));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const result = await verifyCode(session.user, session.firm.id, parsed.data.code);
  if (!result.ok) {
    const messages = {
      invalid: `That code isn't right. ${"attemptsLeft" in result ? result.attemptsLeft : 0} attempt(s) left.`,
      expired: "That code has expired. Send a new one below.",
      locked: "Too many wrong attempts. Send a new code below.",
      none: "There's no active code. Send a new one below.",
    } as const;
    return { status: "error", fieldErrors: { code: messages[result.reason] } };
  }

  redirect("/dashboard");
}

export async function resendCode(_prev: FormState, _formData: FormData): Promise<FormState> {
  const session = await requireSignedIn();
  if (session.user.emailVerified) redirect("/dashboard");

  const result = await issueVerificationCode(session.user);
  if (result.ok) {
    return {
      status: "idle",
      message:
        result.delivery === "email"
          ? `A new code was sent to ${session.user.email}.`
          : "Email isn't configured yet. In development, the code is printed in the server terminal.",
    };
  }
  if (result.reason === "cooldown") {
    return { status: "error", message: `Please wait ${result.retryInSeconds}s before requesting another code.` };
  }
  return { status: "error", message: "We couldn't send the email. Please try again in a minute." };
}

export async function signOut() {
  const session = await getSession();
  await destroySession();
  if (session) {
    console.info("[auth.signOut]", { userId: session.user.id });
  }
  redirect("/login");
}
