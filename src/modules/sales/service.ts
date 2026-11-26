import { OpportunityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateOpportunityInput,
  CreatePipelineInput,
  ListOpportunitiesQuery,
  MoveOpportunityInput,
  UpdateOpportunityInput,
} from "./schemas";

/**
 * Deliberately reuses CRM_VIEW/CRM_MANAGE rather than adding SALES_VIEW/
 * SALES_MANAGE — the existing role grants already line up with who should
 * touch deals (sales-facing roles have CRM_MANAGE; client/contractor roles
 * have neither), and Pipeline/Opportunity are part of the same Phase 2A
 * CRM-and-sales-core build as Contact/Company/Lead. Revisit only if sales
 * permissions genuinely need to diverge from CRM permissions later (e.g. a
 * role that can edit contacts but must never see deal values).
 */
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

// --- Pipelines ---

export async function listPipelines(acting: ActiveMembership) {
  requireCapability(acting, Capability.CRM_VIEW);

  return prisma.pipeline.findMany({
    where: { organisationId: acting.organisationId },
    include: { stages: { orderBy: { position: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
}

export async function createPipeline(acting: ActiveMembership, input: CreatePipelineInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const pipeline = await prisma.pipeline.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      isDefault: input.isDefault ?? false,
      stages: {
        create: (input.stages ?? DEFAULT_STAGES).map((stage, index) => ({
          name: stage.name,
          position: stage.position ?? index,
          probability: stage.probability,
          isWon: stage.isWon,
          isLost: stage.isLost,
        })),
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "pipeline.created",
    resourceType: "Pipeline",
    resourceId: pipeline.id,
  });

  return pipeline;
}

const DEFAULT_STAGES = [
  { name: "New", position: 0, probability: 10, isWon: false, isLost: false },
  { name: "Qualified", position: 1, probability: 25, isWon: false, isLost: false },
  { name: "Proposal", position: 2, probability: 50, isWon: false, isLost: false },
  { name: "Negotiation", position: 3, probability: 75, isWon: false, isLost: false },
  { name: "Won", position: 4, probability: 100, isWon: true, isLost: false },
  { name: "Lost", position: 5, probability: 0, isWon: false, isLost: true },
];

/** Returns the org's default pipeline (creating one with a sensible default
 * stage set if none exists yet) — so the Kanban board always has something
 * to render without requiring a separate "set up your pipeline" step first. */
export async function ensureDefaultPipeline(acting: ActiveMembership) {
  requireCapability(acting, Capability.CRM_VIEW);

  const existing = await prisma.pipeline.findFirst({
    where: { organisationId: acting.organisationId },
    include: { stages: { orderBy: { position: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
  if (existing) return existing;

  return createPipeline(acting, { name: "Sales Pipeline", isDefault: true });
}

// --- Opportunities ---

async function assertStageInPipeline(organisationId: string, pipelineId: string, stageId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, pipeline: { organisationId } },
  });
  if (!stage) throw new NotFoundError("The selected stage was not found in this pipeline.");
  return stage;
}

export async function listOpportunities(acting: ActiveMembership, query: ListOpportunitiesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.OpportunityWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { include: { user: true } },
        stage: true,
      },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getOpportunity(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      company: true,
      contact: true,
      owner: { include: { user: true } },
      stage: true,
      pipeline: { include: { stages: { orderBy: { position: "asc" } } } },
      stageHistory: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!opportunity) throw new NotFoundError("Opportunity not found.");
  return opportunity;
}

export async function createOpportunity(acting: ActiveMembership, input: CreateOpportunityInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const pipeline = await prisma.pipeline.findFirst({
    where: { id: input.pipelineId, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!pipeline) throw new NotFoundError("Pipeline not found in this organisation.");
  const stage = await assertStageInPipeline(acting.organisationId, input.pipelineId, input.stageId);

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("The selected contact was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  // New cards land at the end of their column.
  const lastInStage = await prisma.opportunity.findFirst({
    where: { pipelineId: input.pipelineId, stageId: input.stageId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      organisationId: acting.organisationId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      name: input.name,
      companyId: input.companyId,
      contactId: input.contactId,
      ownerId: input.ownerId,
      valueMinor: input.valueMinor,
      currency: input.currency ?? "GBP",
      probability: input.probability ?? stage.probability,
      expectedCloseDate: input.expectedCloseDate,
      position: (lastInStage?.position ?? -1) + 1,
      tags: input.tags ?? [],
      notes: input.notes,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "opportunity.created",
    resourceType: "Opportunity",
    resourceId: opportunity.id,
  });

  return opportunity;
}

export async function updateOpportunity(acting: ActiveMembership, id: string, input: UpdateOpportunityInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.opportunity.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Opportunity not found.");

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("The selected contact was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const opportunity = await prisma.opportunity.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "opportunity.updated",
    resourceType: "Opportunity",
    resourceId: opportunity.id,
    metadata: { fields: Object.keys(input) },
  });

  return opportunity;
}

export async function archiveOpportunity(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.opportunity.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Opportunity not found.");

  const opportunity = await prisma.opportunity.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "opportunity.archived",
    resourceType: "Opportunity",
    resourceId: opportunity.id,
  });

  return opportunity;
}

/**
 * The Kanban drag-drop persistence endpoint. In one transaction: moves the
 * opportunity to the target stage/position, sets status/wonAt/lostAt/
 * wonReason/lostReason based on whether the target stage is flagged
 * isWon/isLost (clearing them when moved back to a normal stage — a
 * dragged-back card reopens the deal, it doesn't stay silently "won"), and
 * writes an OpportunityStageHistory row only when the stage actually
 * changed (a pure same-column reorder doesn't pollute the stage-history
 * audit trail with a no-op "move").
 */
export async function moveOpportunity(acting: ActiveMembership, id: string, input: MoveOpportunityInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organisationId: acting.organisationId },
  });
  if (!opportunity) throw new NotFoundError("Opportunity not found.");
  if (!input.orderedIds.includes(id)) {
    throw new Error("orderedIds must include the opportunity being moved.");
  }

  const targetStage = await assertStageInPipeline(acting.organisationId, opportunity.pipelineId, input.stageId);
  const stageChanged = targetStage.id !== opportunity.stageId;
  const position = input.orderedIds.indexOf(id);

  const statusFields = targetStage.isWon
    ? {
        status: OpportunityStatus.WON,
        wonAt: new Date(),
        wonReason: input.wonReason,
        lostAt: null,
        lostReason: null,
      }
    : targetStage.isLost
      ? {
          status: OpportunityStatus.LOST,
          lostAt: new Date(),
          lostReason: input.lostReason,
          wonAt: null,
          wonReason: null,
        }
      : { status: OpportunityStatus.OPEN, wonAt: null, wonReason: null, lostAt: null, lostReason: null };

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.opportunity.update({
      where: { id },
      data: {
        stageId: input.stageId,
        position,
        ...statusFields,
      },
    });
    if (stageChanged) {
      await tx.opportunityStageHistory.create({
        data: { opportunityId: id, fromStageId: opportunity.stageId, toStageId: input.stageId },
      });
    }
    // Reindex every OTHER card in the destination column to match its new
    // position in orderedIds — not just the dragged card — so positions
    // never collide or drift after repeated drags.
    await Promise.all(
      input.orderedIds
        .map((cardId, index) => ({ cardId, index }))
        .filter(({ cardId }) => cardId !== id)
        .map(({ cardId, index }) =>
          tx.opportunity.updateMany({
            where: { id: cardId, organisationId: acting.organisationId },
            data: { position: index },
          })
        )
    );
    return result;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: targetStage.isWon ? "opportunity.won" : targetStage.isLost ? "opportunity.lost" : "opportunity.moved",
    resourceType: "Opportunity",
    resourceId: id,
    metadata: { fromStageId: opportunity.stageId, toStageId: input.stageId },
  });

  return updated;
}
