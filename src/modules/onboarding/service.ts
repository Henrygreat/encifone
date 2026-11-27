import type { Prisma } from "@prisma/client";
import { OnboardingAssignee, OnboardingStatus, OnboardingStepStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import type { ActivePortalSession } from "@/modules/portal/auth";
import { NotFoundError } from "@/lib/api";
import { hasSignedContractForOpportunity } from "@/modules/contracts/service";
import { hasSucceededPaymentForOpportunity } from "@/modules/payments/service";
import { hasAcceptedProposalForOpportunity } from "@/modules/proposals/service";
import { notifyMembership, notifyPortalUser } from "@/modules/notifications/service";
import type { CreateOnboardingTemplateInput, UpdateOnboardingTemplateInput, TemplateStepInput } from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

// --- Templates ---

export async function createOnboardingTemplate(acting: ActiveMembership, input: CreateOnboardingTemplateInput) {
  requireCapability(acting, Capability.PORTAL_MANAGE);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.onboardingTemplate.updateMany({
        where: { organisationId: acting.organisationId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.onboardingTemplate.create({
      data: {
        organisationId: acting.organisationId,
        name: input.name,
        description: input.description,
        isDefault: input.isDefault,
        steps: {
          create: input.steps.map((step, index) => stepCreateData(step, index)),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  });
}

function stepCreateData(step: TemplateStepInput, order: number) {
  return {
    order,
    label: step.label,
    description: step.description,
    stepType: step.stepType,
    assignedTo: step.assignedTo,
    isMandatory: step.isMandatory,
    requiresApproval: step.requiresApproval,
    dueOffsetDays: step.dueOffsetDays,
    config: step.config as Prisma.InputJsonValue | undefined,
  };
}

export async function listOnboardingTemplates(acting: ActiveMembership) {
  requireCapability(acting, Capability.PORTAL_VIEW);
  return prisma.onboardingTemplate.findMany({
    where: { organisationId: acting.organisationId, deletedAt: null },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { onboardings: true } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function getOnboardingTemplate(acting: ActiveMembership, templateId: string) {
  requireCapability(acting, Capability.PORTAL_VIEW);
  const template = await prisma.onboardingTemplate.findFirst({
    where: { id: templateId, organisationId: acting.organisationId, deletedAt: null },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!template) throw new NotFoundError("Onboarding template not found.");
  return template;
}

export async function updateOnboardingTemplate(
  acting: ActiveMembership,
  templateId: string,
  input: UpdateOnboardingTemplateInput
) {
  requireCapability(acting, Capability.PORTAL_MANAGE);

  const existing = await prisma.onboardingTemplate.findFirst({
    where: { id: templateId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError("Onboarding template not found.");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.onboardingTemplate.updateMany({
        where: { organisationId: acting.organisationId, isDefault: true, id: { not: templateId } },
        data: { isDefault: false },
      });
    }
    if (input.steps) {
      // Steps are replaced wholesale — any already-started onboarding keeps
      // its own ClientOnboardingStep snapshot, so this never retroactively
      // changes what a client has already been presented with.
      await tx.onboardingTemplateStep.deleteMany({ where: { templateId } });
    }
    return tx.onboardingTemplate.update({
      where: { id: templateId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.steps ? { steps: { create: input.steps.map((step, index) => stepCreateData(step, index)) } } : {}),
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  });
}

export async function archiveOnboardingTemplate(acting: ActiveMembership, templateId: string) {
  requireCapability(acting, Capability.PORTAL_MANAGE);
  const existing = await prisma.onboardingTemplate.findFirst({
    where: { id: templateId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError("Onboarding template not found.");
  return prisma.onboardingTemplate.update({ where: { id: templateId }, data: { deletedAt: new Date(), isDefault: false } });
}

// --- Starting an onboarding ---

async function createOnboardingInstance(
  tx: Prisma.TransactionClient,
  clientId: string,
  template: { id: string; steps: { id: string; order: number; label: string; description: string | null; stepType: string; assignedTo: string; isMandatory: boolean; requiresApproval: boolean; dueOffsetDays: number | null }[] }
) {
  const startedAt = new Date();
  const onboarding = await tx.clientOnboarding.create({
    data: { clientId, templateId: template.id, status: OnboardingStatus.IN_PROGRESS, startedAt },
  });

  for (const step of template.steps) {
    await tx.clientOnboardingStep.create({
      data: {
        onboardingId: onboarding.id,
        templateStepId: step.id,
        order: step.order,
        label: step.label,
        description: step.description,
        stepType: step.stepType as never,
        assignedTo: step.assignedTo as never,
        isMandatory: step.isMandatory,
        requiresApproval: step.requiresApproval,
        dueAt: step.dueOffsetDays != null ? new Date(startedAt.getTime() + step.dueOffsetDays * 86_400_000) : null,
      },
    });
  }

  return tx.clientOnboarding.findUniqueOrThrow({
    where: { id: onboarding.id },
    include: { steps: { orderBy: { order: "asc" } }, template: true },
  });
}

/** Explicit internal start — a client can have at most one onboarding at
 * a time (checked here, not a DB constraint, since a client may be
 * re-onboarded for a new service after a prior onboarding completed). */
export async function startOnboarding(acting: ActiveMembership, clientId: string, templateId: string) {
  requireCapability(acting, Capability.PORTAL_MANAGE);

  const client = await prisma.client.findFirst({
    where: { id: clientId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!client) throw new NotFoundError("Client not found in this organisation.");

  const activeExisting = await prisma.clientOnboarding.findFirst({
    where: { clientId, status: { in: [OnboardingStatus.NOT_STARTED, OnboardingStatus.IN_PROGRESS] } },
  });
  if (activeExisting) throw new Error("This client already has an onboarding in progress.");

  const template = await prisma.onboardingTemplate.findFirst({
    where: { id: templateId, organisationId: acting.organisationId, deletedAt: null },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!template) throw new NotFoundError("Onboarding template not found.");

  const onboarding = await prisma.$transaction((tx) => createOnboardingInstance(tx, clientId, template));

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "onboarding.started",
    resourceType: "ClientOnboarding",
    resourceId: onboarding.id,
    metadata: { clientId, templateId },
  });

  return onboarding;
}

/**
 * System-triggered auto-start — called from the same transaction that
 * creates a Client (src/modules/sales/conversion.ts), never from a
 * directly actor-initiated request, so there is no capability check
 * here (the decision to allow this is the org's own autoStartOnboarding
 * flag, set via /members by someone who already had PORTAL_MANAGE when
 * they turned it on). Idempotent and silent when nothing is configured —
 * never fabricates an onboarding the org hasn't actually opted into.
 */
export async function maybeAutoStartOnboarding(
  tx: Prisma.TransactionClient,
  organisationId: string,
  clientId: string
) {
  const organisation = await tx.organisation.findUnique({
    where: { id: organisationId },
    select: { autoStartOnboarding: true },
  });
  if (!organisation?.autoStartOnboarding) return null;

  const existing = await tx.clientOnboarding.findFirst({ where: { clientId } });
  if (existing) return null;

  const defaultTemplate = await tx.onboardingTemplate.findFirst({
    where: { organisationId, isDefault: true, deletedAt: null },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!defaultTemplate) return null;

  return createOnboardingInstance(tx, clientId, defaultTemplate);
}

// --- Reading an onboarding (with derived-step auto-sync) ---

/** PROPOSAL_ACCEPTANCE/CONTRACT_SIGNATURE/PAYMENT steps complete
 * automatically once the real linked record is satisfied — never a
 * manual action, and never fabricated: a client with no originating
 * opportunity simply never auto-satisfies these. */
async function syncDerivedSteps(onboardingId: string, clientId: string) {
  const [onboarding, client] = await Promise.all([
    prisma.clientOnboarding.findUniqueOrThrow({
      where: { id: onboardingId },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
  ]);

  if (!client.originatingOpportunityId) return onboarding;

  const opportunityId = client.originatingOpportunityId;
  let changed = false;

  for (const step of onboarding.steps) {
    if (step.status === OnboardingStepStatus.COMPLETED) continue;

    let satisfied = false;
    if (step.stepType === "PROPOSAL_ACCEPTANCE") {
      satisfied = await hasAcceptedProposalForOpportunity(client.organisationId, opportunityId);
    } else if (step.stepType === "CONTRACT_SIGNATURE") {
      satisfied = await hasSignedContractForOpportunity(client.organisationId, opportunityId);
    } else if (step.stepType === "PAYMENT") {
      satisfied = await hasSucceededPaymentForOpportunity(client.organisationId, opportunityId);
    } else {
      continue;
    }

    if (satisfied) {
      await prisma.clientOnboardingStep.update({
        where: { id: step.id },
        data: { status: OnboardingStepStatus.COMPLETED, completedAt: new Date() },
      });
      changed = true;
    }
  }

  if (changed) {
    await maybeCompleteOnboarding(onboardingId);
    return prisma.clientOnboarding.findUniqueOrThrow({
      where: { id: onboardingId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  }
  return onboarding;
}

export async function getClientOnboarding(acting: ActiveMembership, clientId: string) {
  requireCapability(acting, Capability.PORTAL_VIEW);
  const client = await prisma.client.findFirst({
    where: { id: clientId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!client) throw new NotFoundError("Client not found in this organisation.");

  const onboarding = await prisma.clientOnboarding.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });
  if (!onboarding) return null;
  return syncDerivedSteps(onboarding.id, clientId);
}

export async function getPortalOnboarding(portalSession: ActivePortalSession) {
  const onboarding = await prisma.clientOnboarding.findFirst({
    where: { clientId: portalSession.clientId },
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });
  if (!onboarding) return null;
  return syncDerivedSteps(onboarding.id, portalSession.clientId);
}

// --- Completing / reviewing / skipping a step ---

async function loadStepForActor(stepId: string, organisationId?: string, clientId?: string) {
  const step = await prisma.clientOnboardingStep.findUnique({
    where: { id: stepId },
    include: { onboarding: { include: { client: true } } },
  });
  if (!step) throw new NotFoundError("Onboarding step not found.");
  if (organisationId && step.onboarding.client.organisationId !== organisationId) {
    throw new NotFoundError("Onboarding step not found.");
  }
  if (clientId && step.onboarding.clientId !== clientId) {
    throw new NotFoundError("Onboarding step not found.");
  }
  return step;
}

async function maybeCompleteOnboarding(onboardingId: string) {
  const steps = await prisma.clientOnboardingStep.findMany({ where: { onboardingId } });
  const mandatoryUnfinished = steps.some(
    (s) => s.isMandatory && s.status !== OnboardingStepStatus.COMPLETED && s.status !== OnboardingStepStatus.SKIPPED
  );
  if (mandatoryUnfinished) return;

  const onboarding = await prisma.clientOnboarding.update({
    where: { id: onboardingId },
    data: { status: OnboardingStatus.COMPLETED, completedAt: new Date() },
    include: { client: true },
  });

  if (onboarding.client.ownerId) {
    await notifyMembership({
      organisationId: onboarding.client.organisationId,
      membershipId: onboarding.client.ownerId,
      type: NotificationType.ONBOARDING_COMPLETED,
      title: `Onboarding completed for ${onboarding.client.name}`,
      href: `/clients/${onboarding.clientId}`,
    });
  }
}

async function notifyStepAssignee(step: Awaited<ReturnType<typeof loadStepForActor>>, title: string) {
  if (step.assignedTo === OnboardingAssignee.INTERNAL) {
    if (step.onboarding.client.ownerId) {
      await notifyMembership({
        organisationId: step.onboarding.client.organisationId,
        membershipId: step.onboarding.client.ownerId,
        type: NotificationType.ONBOARDING_STEP_COMPLETED,
        title,
        href: `/clients/${step.onboarding.clientId}`,
      });
    }
  } else {
    const portalUser = await prisma.clientPortalUser.findFirst({ where: { clientId: step.onboarding.clientId } });
    if (portalUser) {
      await notifyPortalUser({
        organisationId: step.onboarding.client.organisationId,
        portalUserId: portalUser.id,
        type: NotificationType.ONBOARDING_STEP_COMPLETED,
        title,
      });
    }
  }
}

const DERIVED_STEP_TYPES = new Set(["PROPOSAL_ACCEPTANCE", "CONTRACT_SIGNATURE", "PAYMENT"]);

/** actor is either the signed-in client (portalSession) or internal
 * staff (acting) — exactly one must be provided. Only the party the
 * step is actually assignedTo may complete it this way; internal staff
 * who need to force progress on a client-assigned step use
 * overrideCompleteOnboardingStep instead, which is explicitly an
 * override, not a normal completion. */
export async function completeOnboardingStep(
  actor: { portalSession: ActivePortalSession } | { acting: ActiveMembership },
  stepId: string,
  data?: Record<string, unknown>
) {
  const step =
    "portalSession" in actor
      ? await loadStepForActor(stepId, undefined, actor.portalSession.clientId)
      : await loadStepForActor(stepId, actor.acting.organisationId);

  if (DERIVED_STEP_TYPES.has(step.stepType)) {
    throw new Error("This step completes automatically once the linked record is finalised — it can't be marked complete manually.");
  }
  if (step.status !== OnboardingStepStatus.PENDING && step.status !== OnboardingStepStatus.IN_PROGRESS) {
    throw new Error(`This step is already ${step.status.toLowerCase().replace("_", " ")}.`);
  }

  const actorIsClient = "portalSession" in actor;
  if (actorIsClient && step.assignedTo !== OnboardingAssignee.CLIENT) {
    throw new ForbiddenError("This step is assigned to your team's internal staff, not to you.");
  }
  if (!actorIsClient && step.assignedTo !== OnboardingAssignee.INTERNAL) {
    throw new ForbiddenError("This step is assigned to the client, not to internal staff.");
  }

  const nextStatus = step.requiresApproval ? OnboardingStepStatus.AWAITING_APPROVAL : OnboardingStepStatus.COMPLETED;
  const updated = await prisma.clientOnboardingStep.update({
    where: { id: stepId },
    data: {
      status: nextStatus,
      data: data as Prisma.InputJsonValue | undefined,
      ...(nextStatus === OnboardingStepStatus.COMPLETED
        ? {
            completedAt: new Date(),
            completedByPortalUserId: actorIsClient ? actor.portalSession.portalUserId : null,
            completedByMembershipId: actorIsClient ? null : actor.acting.membershipId,
          }
        : {}),
    },
  });

  if (nextStatus === OnboardingStepStatus.COMPLETED) {
    await maybeCompleteOnboarding(step.onboardingId);
    if (actorIsClient) await notifyStepAssignee(step, `"${step.label}" was completed by the client`);
  } else if (actorIsClient) {
    // Client submitted a requiresApproval step — notify the internal
    // owner that something needs review.
    if (step.onboarding.client.ownerId) {
      await notifyMembership({
        organisationId: step.onboarding.client.organisationId,
        membershipId: step.onboarding.client.ownerId,
        type: NotificationType.ONBOARDING_STEP_DUE,
        title: `"${step.label}" needs your review`,
        href: `/clients/${step.onboarding.clientId}`,
      });
    }
  }

  return updated;
}

export async function reviewOnboardingStep(
  acting: ActiveMembership,
  stepId: string,
  decision: "APPROVE" | "REJECT",
  note?: string
) {
  requireCapability(acting, Capability.PORTAL_MANAGE);
  const step = await loadStepForActor(stepId, acting.organisationId);

  if (step.status !== OnboardingStepStatus.AWAITING_APPROVAL) {
    throw new Error("This step is not awaiting approval.");
  }

  const updated = await prisma.clientOnboardingStep.update({
    where: { id: stepId },
    data:
      decision === "APPROVE"
        ? {
            status: OnboardingStepStatus.COMPLETED,
            completedAt: new Date(),
            approvedByMembershipId: acting.membershipId,
            approvedAt: new Date(),
            reviewNote: note,
          }
        : {
            status: OnboardingStepStatus.PENDING,
            reviewNote: note ?? "Submission was not approved — please review and resubmit.",
          },
  });

  if (decision === "APPROVE") {
    await maybeCompleteOnboarding(step.onboardingId);
  }

  const portalUser = await prisma.clientPortalUser.findFirst({ where: { clientId: step.onboarding.clientId } });
  if (portalUser) {
    await notifyPortalUser({
      organisationId: step.onboarding.client.organisationId,
      portalUserId: portalUser.id,
      type: NotificationType.ONBOARDING_STEP_COMPLETED,
      title:
        decision === "APPROVE" ? `"${step.label}" was approved` : `"${step.label}" needs another look`,
      body: note,
    });
  }

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: decision === "APPROVE" ? "onboarding_step.approved" : "onboarding_step.rejected",
    resourceType: "ClientOnboardingStep",
    resourceId: stepId,
  });

  return updated;
}

export async function skipOnboardingStep(acting: ActiveMembership, stepId: string) {
  requireCapability(acting, Capability.PORTAL_MANAGE);
  const step = await loadStepForActor(stepId, acting.organisationId);
  if (step.isMandatory) {
    throw new Error("A mandatory step cannot be skipped.");
  }
  const updated = await prisma.clientOnboardingStep.update({
    where: { id: stepId },
    data: { status: OnboardingStepStatus.SKIPPED },
  });
  await maybeCompleteOnboarding(step.onboardingId);
  return updated;
}

/** An explicit internal override — e.g. the client accepted a proposal
 * verbally over a phone call rather than through the system. Always
 * recorded as who did it and why, never silent. */
export async function overrideCompleteOnboardingStep(acting: ActiveMembership, stepId: string, note: string) {
  requireCapability(acting, Capability.PORTAL_MANAGE);
  const step = await loadStepForActor(stepId, acting.organisationId);
  if (step.status === OnboardingStepStatus.COMPLETED) {
    throw new Error("This step is already complete.");
  }

  const updated = await prisma.clientOnboardingStep.update({
    where: { id: stepId },
    data: {
      status: OnboardingStepStatus.COMPLETED,
      completedAt: new Date(),
      completedByMembershipId: acting.membershipId,
      reviewNote: note,
    },
  });
  await maybeCompleteOnboarding(step.onboardingId);

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "onboarding_step.override_completed",
    resourceType: "ClientOnboardingStep",
    resourceId: stepId,
    metadata: { note },
  });

  return updated;
}
