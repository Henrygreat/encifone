import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { MembershipStatus, type ActivityEntityType } from "@prisma/client";
import type { CreateSavedViewInput, UpdateSavedViewInput } from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

/** `ActiveMembership` carries userId/organisationId/role, not the
 * Membership row's own id — resolve it here rather than widening that
 * shared type just for this module's ownerId column. */
async function getActingMembershipId(acting: ActiveMembership): Promise<string> {
  const membership = await prisma.membership.findFirstOrThrow({
    where: { userId: acting.userId, organisationId: acting.organisationId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });
  return membership.id;
}

/**
 * Org-wide (shared) views and the caller's own private views for this
 * entity type — never another member's private view. Shared views are
 * listed first so they read as the "house" defaults.
 */
export async function listSavedViews(acting: ActiveMembership, entityType: ActivityEntityType) {
  requireCapability(acting, Capability.CRM_VIEW);
  const membershipId = await getActingMembershipId(acting);

  return prisma.savedView.findMany({
    where: {
      organisationId: acting.organisationId,
      entityType,
      OR: [{ ownerId: null }, { ownerId: membershipId }],
    },
    orderBy: [{ ownerId: "asc" }, { createdAt: "asc" }],
  });
}

export async function createSavedView(acting: ActiveMembership, input: CreateSavedViewInput) {
  requireCapability(acting, Capability.CRM_VIEW);
  // A shared (org-wide) view changes what every teammate sees by default —
  // that's a step beyond a personal preference, so it needs the same
  // capability as editing other CRM records.
  if (input.shared) {
    requireCapability(acting, Capability.CRM_MANAGE);
  }

  const ownerId = input.shared ? null : await getActingMembershipId(acting);

  const view = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.savedView.updateMany({
        where: { organisationId: acting.organisationId, entityType: input.entityType, ownerId },
        data: { isDefault: false },
      });
    }
    return tx.savedView.create({
      data: {
        organisationId: acting.organisationId,
        entityType: input.entityType,
        name: input.name,
        filters: input.filters as object,
        isDefault: input.isDefault ?? false,
        ownerId,
      },
    });
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "saved_view.created",
    resourceType: "SavedView",
    resourceId: view.id,
    metadata: { entityType: input.entityType, shared: Boolean(input.shared) },
  });

  return view;
}

async function getOwnedOrSharedView(acting: ActiveMembership, id: string) {
  const view = await prisma.savedView.findFirst({
    where: { id, organisationId: acting.organisationId },
  });
  if (!view) throw new NotFoundError("Saved view not found.");
  return view;
}

export async function updateSavedView(acting: ActiveMembership, id: string, input: UpdateSavedViewInput) {
  requireCapability(acting, Capability.CRM_VIEW);
  const existing = await getOwnedOrSharedView(acting, id);

  const isShared = existing.ownerId === null;
  if (isShared) {
    requireCapability(acting, Capability.CRM_MANAGE);
  } else if (existing.ownerId !== (await getActingMembershipId(acting))) {
    throw new ForbiddenError("You can only edit your own saved views.");
  }

  const view = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.savedView.updateMany({
        where: { organisationId: acting.organisationId, entityType: existing.entityType, ownerId: existing.ownerId },
        data: { isDefault: false },
      });
    }
    return tx.savedView.update({
      where: { id },
      data: {
        name: input.name,
        filters: input.filters !== undefined ? (input.filters as object) : undefined,
        isDefault: input.isDefault,
      },
    });
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "saved_view.updated",
    resourceType: "SavedView",
    resourceId: id,
  });

  return view;
}

export async function deleteSavedView(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);
  const existing = await getOwnedOrSharedView(acting, id);

  const isShared = existing.ownerId === null;
  if (isShared) {
    requireCapability(acting, Capability.CRM_MANAGE);
  } else if (existing.ownerId !== (await getActingMembershipId(acting))) {
    throw new ForbiddenError("You can only delete your own saved views.");
  }

  await prisma.savedView.delete({ where: { id } });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "saved_view.deleted",
    resourceType: "SavedView",
    resourceId: id,
  });

  return { id };
}
