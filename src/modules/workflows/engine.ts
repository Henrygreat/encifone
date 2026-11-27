import { Prisma, WorkflowExecutionStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { prisma } from "@/lib/prisma";
import { recomputeProjectProgress } from "@/modules/projects/service";

interface WorkflowAction {
  type: string;
  params?: Record<string, unknown>;
}

async function runAction(organisationId: string, payload: Record<string, unknown> | null, action: WorkflowAction) {
  switch (action.type) {
    case "create_task": {
      const title = String(action.params?.title ?? "Workflow task");
      const projectId = typeof action.params?.projectId === "string" ? action.params.projectId : null;
      const task = await prisma.task.create({
        data: {
          organisationId,
          projectId,
          title,
          description: typeof action.params?.description === "string" ? action.params.description : undefined,
          status: "TODO",
          priority: "MEDIUM",
        },
      });
      if (projectId) await recomputeProjectProgress(projectId);
      return { taskId: task.id };
    }
    case "create_project": {
      const name = String(action.params?.name ?? payload?.projectName ?? "Workflow project");
      const project = await prisma.project.create({
        data: {
          organisationId,
          name,
          status: "DRAFT",
          priority: "MEDIUM",
          health: "ON_TRACK",
        },
      });
      return { projectId: project.id };
    }
    case "create_notification": {
      const recipientMembershipId = typeof action.params?.recipientMembershipId === "string" ? action.params.recipientMembershipId : null;
      if (!recipientMembershipId) return { skipped: "missing recipientMembershipId" };
      const title = String(action.params?.title ?? "Workflow update");
      const body = typeof action.params?.body === "string" ? action.params.body : null;
      await prisma.notification.create({
        data: {
          organisationId,
          recipientType: "MEMBERSHIP",
          recipientMembershipId,
          type: "GENERAL",
          title,
          body,
        },
      });
      return { notified: recipientMembershipId };
    }
    case "update_service_request_status": {
      const serviceRequestId = typeof action.params?.serviceRequestId === "string" ? action.params.serviceRequestId : null;
      const status = typeof action.params?.status === "string" ? action.params.status : null;
      if (!serviceRequestId || !status) return { skipped: "missing serviceRequestId/status" };
      await prisma.serviceRequest.updateMany({
        where: { id: serviceRequestId, organisationId },
        data: { status: status as never },
      });
      return { serviceRequestId, status };
    }
    default:
      return { skipped: `unsupported action type ${action.type}` };
  }
}

export async function executeWorkflowExecution(executionId: string) {
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflowDefinition: true },
  });

  if (!execution) return;
  if (execution.status === WorkflowExecutionStatus.SUCCEEDED) return;

  const now = new Date();
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: WorkflowExecutionStatus.RUNNING,
      startedAt: execution.startedAt ?? now,
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  const actions = (execution.workflowDefinition.actions as unknown as WorkflowAction[]) ?? [];
  const payload = (execution.payload as Record<string, unknown> | null) ?? null;

  try {
    const results: Array<Record<string, unknown>> = [];
    for (const action of actions) {
      results.push(await runAction(execution.organisationId, payload, action));
    }

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: WorkflowExecutionStatus.SUCCEEDED,
        finishedAt: new Date(),
        payload: {
          ...(payload ?? {}),
          _results: results,
        } as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog({
      organisationId: execution.organisationId,
      actorUserId: null,
      action: "workflow.execution_succeeded",
      resourceType: "WorkflowExecution",
      resourceId: executionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow execution failed.";
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: WorkflowExecutionStatus.FAILED,
        lastError: message,
        finishedAt: new Date(),
      },
    });

    await writeAuditLog({
      organisationId: execution.organisationId,
      actorUserId: null,
      action: "workflow.execution_failed",
      resourceType: "WorkflowExecution",
      resourceId: executionId,
      metadata: { message },
    });

    throw error;
  }
}
