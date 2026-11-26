import { ActivityEntityType, ActivityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type { CreateActivityInput, ListActivitiesQuery, UpdateActivityInput } from "./schemas";

/** Same reasoning as src/modules/sales/service.ts: reuses CRM_VIEW/CRM_MANAGE
 * rather than a dedicated capability pair — Activities are a cross-cutting
 * part of the same Phase 2A CRM-and-sales-core build. */
function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

async function assertMembershipInOrg(organisationId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organisationId },
    select: { id: true },
  });
  if (!membership) {
    throw new NotFoundError("The selected owner was not found in this organisation.");
  }
}

/**
 * `entityId` is polymorphic (ActivityEntityType names which table it lives
 * in) — Prisma has no native polymorphic relation, so this is resolved and
 * tenant-checked here in the service layer, never trusted as a valid
 * same-tenant foreign key just because it looks like a plausible id. Same
 * pattern as CustomFieldValue (src/modules/crm/schemas.ts's doc comment).
 */
async function assertEntityInOrg(organisationId: string, entityType: ActivityEntityType, entityId: string) {
  const exists = await (
    {
      COMPANY: () => prisma.company.findFirst({ where: { id: entityId, organisationId }, select: { id: true } }),
      CONTACT: () => prisma.contact.findFirst({ where: { id: entityId, organisationId }, select: { id: true } }),
      LEAD: () => prisma.lead.findFirst({ where: { id: entityId, organisationId }, select: { id: true } }),
      OPPORTUNITY: () =>
        prisma.opportunity.findFirst({ where: { id: entityId, organisationId }, select: { id: true } }),
    } satisfies Record<ActivityEntityType, () => Promise<{ id: string } | null>>
  )[entityType]();

  if (!exists) {
    throw new NotFoundError(`The ${entityType.toLowerCase()} this activity is attached to was not found in this organisation.`);
  }
}

export async function listActivities(acting: ActiveMembership, query: ListActivitiesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ActivityWhereInput = {
    organisationId: acting.organisationId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
    ...(query.dueBefore ? { dueAt: { lte: query.dueBefore } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: { owner: { include: { user: true } } },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.activity.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getActivity(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const activity = await prisma.activity.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: { owner: { include: { user: true } } },
  });
  if (!activity) throw new NotFoundError("Activity not found.");
  return activity;
}

export async function createActivity(acting: ActiveMembership, input: CreateActivityInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  await assertEntityInOrg(acting.organisationId, input.entityType, input.entityId);
  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!opportunity) throw new NotFoundError("The selected opportunity was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  // A logged call/meeting/email/note is a record of something that already
  // happened — complete on creation, no dueAt expected. A task/reminder is
  // the opposite: open, with a dueAt. See prisma/schema.prisma's Activity
  // doc comment.
  const isLoggedPastEvent = input.type !== "TASK" && !input.dueAt;

  const activity = await prisma.activity.create({
    data: {
      organisationId: acting.organisationId,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      subject: input.subject,
      body: input.body,
      dueAt: input.dueAt,
      priority: input.priority ?? "MEDIUM",
      status: isLoggedPastEvent ? ActivityStatus.COMPLETED : ActivityStatus.OPEN,
      completedAt: isLoggedPastEvent ? new Date() : null,
      ownerId: input.ownerId,
      createdByUserId: acting.userId,
      opportunityId: input.opportunityId,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "activity.created",
    resourceType: "Activity",
    resourceId: activity.id,
    metadata: { type: activity.type, entityType: activity.entityType, entityId: activity.entityId },
  });

  return activity;
}

export async function updateActivity(acting: ActiveMembership, id: string, input: UpdateActivityInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.activity.findFirst({
    where: { id, organisationId: acting.organisationId },
  });
  if (!existing) throw new NotFoundError("Activity not found.");

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!opportunity) throw new NotFoundError("The selected opportunity was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const completedAt =
    input.status === ActivityStatus.COMPLETED && existing.status !== ActivityStatus.COMPLETED
      ? new Date()
      : input.status && input.status !== ActivityStatus.COMPLETED
        ? null
        : undefined;

  const activity = await prisma.activity.update({
    where: { id },
    data: { ...input, ...(completedAt !== undefined ? { completedAt } : {}) },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "activity.updated",
    resourceType: "Activity",
    resourceId: activity.id,
    metadata: { fields: Object.keys(input) },
  });

  return activity;
}

export async function completeActivity(acting: ActiveMembership, id: string) {
  return updateActivity(acting, id, { status: ActivityStatus.COMPLETED });
}
