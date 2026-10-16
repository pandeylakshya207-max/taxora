import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Append-only audit entries. Pass the transaction client so the audit row is
 * written in the same transaction as the change it describes: either both are
 * saved or neither is.
 */
export type AuditEntry = {
  firmId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
};

export function auditData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    firmId: entry.firmId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details,
  };
}
