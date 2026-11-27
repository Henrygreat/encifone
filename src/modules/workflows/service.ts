import { Prisma, WorkflowExecutionStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { enqueueSystemJob } from "@/workers/queue-client";
import type {
  CreateWorkflowDefinitionInput,
  ListWorkflowDefinitionsQuery,
  UpdateWorkflowDefinitionInput,
} from "./schemas";

async function assertWorkflowInOrg(organisationId: string, id: string) {
  const flow = await prisma.workflowDefinition.findFirst({ where: { id, organisationId } });
  if (!flow) throw new NotFoundError("Workflow not found.");
  return flow;
}

export async function listWorkflowDefinitions(acting: ActiveMembership, query: ListWorkflowDefinitionsQuery) {
  requireCapability(acting, Capability.WORKFLOW_VIEW);

  const where = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.workflowDefinition.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.workflowDefinition.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function createWorkflowDefinition(acting: ActiveMembership, input: CreateWorkflowDefinitionInput) {
  requireCapability(acting, Capability.WORKFLOW_MANAGE);

  const flow = await prisma.workflowDefinition.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      description: input.description,
      triggerEvent: input.triggerEvent,
      conditions: input.conditions as Prisma.InputJsonValue | undefined,
      actions: input.actions as Prisma.InputJsonValue,
      isTemplate: input.isTemplate ?? false,
      status: input.status,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workflow.created",
    resourceType: "WorkflowDefinition",
    resourceId: flow.id,
  });

  return flow;
}

export async function updateWorkflowDefinition(
  acting: ActiveMembership,
  id: string,
  input: UpdateWorkflowDefinitionInput
) {
  requireCapability(acting, Capability.WORKFLOW_MANAGE);
  const existing = await assertWorkflowInOrg(acting.organisationId, id);

  const { conditions, actions, ...rest } = input;

  const flow = await prisma.workflowDefinition.update({
    where: { id },
    data: {
      ...rest,
      ...(conditions === undefined ? {} : { conditions: conditions as Prisma.InputJsonValue }),
      ...(actions === undefined ? {} : { actions: actions as Prisma.InputJsonValue }),
      version: input.actions || input.conditions || input.triggerEvent ? existing.version + 1 : existing.version,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workflow.updated",
    resourceType: "WorkflowDefinition",
    resourceId: flow.id,
  });

  return flow;
}

export async function listWorkflowExecutions(acting: ActiveMembership, workflowId?: string) {
  requireCapability(acting, Capability.WORKFLOW_VIEW);

  return prisma.workflowExecution.findMany({
    where: {
      organisationId: acting.organisationId,
      ...(workflowId ? { workflowDefinitionId: workflowId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function triggerWorkflowExecution(
  acting: ActiveMembership,
  workflowId: string,
  idempotencyKey: string,
  payload?: Record<string, unknown>
) {
  requireCapability(acting, Capability.WORKFLOW_MANAGE);
  await assertWorkflowInOrg(acting.organisationId, workflowId);

  const execution = await prisma.workflowExecution.upsert({
    where: { workflowDefinitionId_idempotencyKey: { workflowDefinitionId: workflowId, idempotencyKey } },
    update: {},
    create: {
      workflowDefinitionId: workflowId,
      organisationId: acting.organisationId,
      idempotencyKey,
      payload: payload as Prisma.InputJsonValue | undefined,
      status: WorkflowExecutionStatus.PENDING,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workflow.execution_triggered",
    resourceType: "WorkflowExecution",
    resourceId: execution.id,
  });

  await enqueueSystemJob(
    "workflow.execute",
    { executionId: execution.id },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  return execution;
}
