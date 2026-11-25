import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface WriteAuditLogInput {
  organisationId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AuditLog rows are append-only — nothing in the codebase should ever
 * update or delete one. See docs/SECURITY.md and docs/DATABASE_SCHEMA.md.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
