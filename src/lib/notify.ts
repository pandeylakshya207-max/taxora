import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Create in-app notifications. Pass the transaction client when the event is
 * part of a transaction, so a notification is only created if the change it
 * announces was actually saved.
 *
 * userIds omitted = every member of the workspace.
 */
export async function notify(
  client: Prisma.TransactionClient,
  input: { firmId: string; kind: string; title: string; body: string; href?: string; userIds?: string[]; excludeUserId?: string },
) {
  let userIds = input.userIds;
  if (!userIds) {
    const members = await client.membership.findMany({ where: { firmId: input.firmId }, select: { userId: true } });
    userIds = members.map((m) => m.userId);
  }
  userIds = [...new Set(userIds)].filter((id) => id !== input.excludeUserId);
  if (!userIds.length) return;
  await client.notification.createMany({
    data: userIds.map((userId) => ({
      firmId: input.firmId,
      userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      href: input.href ?? null,
    })),
  });
}
