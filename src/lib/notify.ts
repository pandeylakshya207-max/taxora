import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Create in-app notifications. Pass the transaction client when the event is
 * part of a transaction, so a notification is only created if the change it
 * announces was actually saved.
 *
 * userIds omitted = every member of the workspace. Members who switched this
 * kind off in Settings are skipped.
 */
export async function notify(
  client: Prisma.TransactionClient,
  input: { firmId: string; kind: string; title: string; body: string; href?: string; userIds?: string[]; excludeUserId?: string },
) {
  const members = await client.membership.findMany({
    where: { firmId: input.firmId, ...(input.userIds && { userId: { in: input.userIds } }) },
    select: { userId: true, mutedNotifications: true },
  });
  const recipients = members
    .filter((m) => m.userId !== input.excludeUserId && !m.mutedNotifications.includes(input.kind))
    .map((m) => m.userId);
  if (!recipients.length) return;
  await client.notification.createMany({
    data: [...new Set(recipients)].map((userId) => ({
      firmId: input.firmId,
      userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      href: input.href ?? null,
    })),
  });
  // Refresh the bell count in the shared layout on the next page the user sees.
  try {
    revalidatePath("/", "layout");
  } catch {
    // Outside a request (e.g. a script) there is nothing to refresh.
  }
}
