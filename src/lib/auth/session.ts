import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Server-side sessions.
 *
 * The browser holds a random 256-bit token in an httpOnly cookie. The database
 * stores only its SHA-256 hash, so a database leak cannot be replayed as a login.
 * Every session is bound to one firm — that firmId is what scopes every query.
 */

export const SESSION_COOKIE = "taxora_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, firmId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, firmId, expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionContext = {
  sessionId: string;
  user: { id: string; name: string; email: string; emailVerified: boolean };
  firm: { id: string; name: string; kind: "CA_PRACTICE" | "COMPANY" | "INDIVIDUAL" };
  role: "OWNER" | "ADMIN" | "MEMBER";
};

/**
 * Returns the signed-in user and firm, or null.
 * Wrapped in React cache() so several components in one request share one lookup.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // One round trip: session + user + firm + this user's membership in that firm.
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerifiedAt: true,
          memberships: { select: { firmId: true, role: true } },
        },
      },
      firm: { select: { id: true, name: true, kind: true } },
    },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  // Membership is re-checked on every request: removing someone from a workspace
  // takes effect immediately, not when their cookie expires.
  const membership = session.user.memberships.find((m) => m.firmId === session.firmId);
  if (!membership) return null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerifiedAt !== null,
    },
    firm: session.firm,
    role: membership.role,
  };
});

/**
 * For pages and actions that require a signed-in, email-verified user.
 * Not signed in -> /login. Signed in but unverified -> /verify.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify");
  return session;
}

/** Only for the verification flow itself: signed in, email not yet required. */
export async function requireSignedIn(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}
