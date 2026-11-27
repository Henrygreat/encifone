import { ClientLifecycleStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateClientInput,
  ListClientsQuery,
  TransitionLifecycleInput,
  UpdateClientInput,
} from "./schemas";

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
  if (!membership) throw new NotFoundError("The selected owner was not found in this organisation.");
}

export async function listClients(acting: ActiveMembership, query: ListClientsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ClientWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.lifecycleStage ? { lifecycleStage: query.lifecycleStage } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        primaryContact: { select: { id: true, firstName: true, lastName: true } },
        owner: { include: { user: true } },
      },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

/**
 * The full Client 360 workspace payload — company, primary contact, owner,
 * originating opportunity, lifecycle history, and every related
 * lead/opportunity/activity across the client's company and contact. Every
 * relation is resolved through an organisationId-scoped query, never a bare
 * id lookup — see docs/SECURITY.md §3.
 */
export async function getClient(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const client = await prisma.client.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      company: true,
      primaryContact: true,
      owner: { include: { user: true } },
      originatingOpportunity: { include: { stage: true } },
      lifecycleHistory: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!client) throw new NotFoundError("Client not found.");

  const [relatedOpportunities, relatedActivities] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        organisationId: acting.organisationId,
        deletedAt: null,
        OR: [
          client.companyId ? { companyId: client.companyId } : undefined,
          client.primaryContactId ? { contactId: client.primaryContactId } : undefined,
        ].filter((c): c is NonNullable<typeof c> => Boolean(c)),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.activity.findMany({
      where: {
        organisationId: acting.organisationId,
        OR: [
          client.companyId ? ({ entityType: "COMPANY", entityId: client.companyId } as const) : undefined,
          client.primaryContactId
            ? ({ entityType: "CONTACT", entityId: client.primaryContactId } as const)
            : undefined,
        ].filter((c): c is NonNullable<typeof c> => Boolean(c)),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { owner: { include: { user: true } } },
    }),
  ]);

  return { client, relatedOpportunities, relatedActivities };
}

export async function createClient(acting: ActiveMembership, input: CreateClientInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.primaryContactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.primaryContactId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("The selected contact was not found in this organisation.");
  }
  if (input.originatingOpportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.originatingOpportunityId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!opportunity) throw new NotFoundError("The selected opportunity was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const client = await prisma.client.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      companyId: input.companyId,
      primaryContactId: input.primaryContactId,
      originatingOpportunityId: input.originatingOpportunityId,
      ownerId: input.ownerId,
      tags: input.tags ?? [],
      notes: input.notes,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "client.created",
    resourceType: "Client",
    resourceId: client.id,
  });

  return client;
}

export async function updateClient(acting: ActiveMembership, id: string, input: UpdateClientInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.client.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Client not found.");

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.primaryContactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.primaryContactId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("The selected contact was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const client = await prisma.client.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "client.updated",
    resourceType: "Client",
    resourceId: client.id,
    metadata: { fields: Object.keys(input) },
  });

  return client;
}

/**
 * Lifecycle transitions are currently unrestricted (any stage to any
 * stage) — a configurable rules engine (which stages a given org allows
 * moving between) is a real, documented future enhancement, not built
 * here. What IS enforced: the record is written to ClientLifecycleHistory
 * every time, so "how did this client get here" is always answerable.
 */
export async function transitionClientLifecycle(
  acting: ActiveMembership,
  id: string,
  input: TransitionLifecycleInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.client.findFirst({ where: { id, organisationId: acting.organisationId } });
  if (!existing) throw new NotFoundError("Client not found.");

  if (existing.lifecycleStage === input.toStage) {
    return existing;
  }

  const client = await prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({ where: { id }, data: { lifecycleStage: input.toStage } });
    await tx.clientLifecycleHistory.create({
      data: {
        clientId: id,
        fromStage: existing.lifecycleStage,
        toStage: input.toStage,
        changedByUserId: acting.userId,
      },
    });
    return updated;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "client.lifecycle_changed",
    resourceType: "Client",
    resourceId: id,
    metadata: { fromStage: existing.lifecycleStage, toStage: input.toStage },
  });

  return client;
}

/**
 * Called from src/modules/sales/service.ts's moveOpportunity when an
 * opportunity enters a `isWon` stage. Idempotent — an opportunity can only
 * ever originate one Client (enforced by the unique constraint on
 * originatingOpportunityId), so calling this twice for the same deal is a
 * no-op on the second call, not a duplicate.
 */
export async function ensureClientFromWonOpportunity(
  tx: Prisma.TransactionClient,
  organisationId: string,
  opportunityId: string
) {
  const existing = await tx.client.findUnique({ where: { originatingOpportunityId: opportunityId } });
  if (existing) return existing;

  const opportunity = await tx.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });

  return tx.client.create({
    data: {
      organisationId,
      name: opportunity.name,
      companyId: opportunity.companyId,
      primaryContactId: opportunity.contactId,
      originatingOpportunityId: opportunity.id,
      ownerId: opportunity.ownerId,
      lifecycleStage: ClientLifecycleStage.WON,
    },
  });
}
