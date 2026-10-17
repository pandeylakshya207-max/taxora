import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/** Unread notification count for the signed-in user in their workspace. */
export async function GET() {
  const session = await getSession();
  if (!session || !session.user.emailVerified) return Response.json({ error: "Not signed in." }, { status: 401 });
  const unread = await db.notification.count({
    where: { userId: session.user.id, firmId: session.firm.id, readAt: null },
  });
  return Response.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
