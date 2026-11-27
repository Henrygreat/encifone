import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getWorkforceAnalytics } from "@/modules/workforce/service";

export async function GET() {
  try {
    const acting = await requireActiveMembership();

    const [
      projectOpen,
      projectCompleted,
      projectOverdue,
      taskOpen,
      taskDone,
      taskOverdue,
      ticketOpen,
      ticketResolved,
      workflowActive,
      workflowSuccess,
      workflowFailed,
      workforce,
    ] = await Promise.all([
      prisma.project.count({ where: { organisationId: acting.organisationId, status: { in: ["DRAFT", "ACTIVE", "ON_HOLD"] }, archivedAt: null } }),
      prisma.project.count({ where: { organisationId: acting.organisationId, status: "COMPLETED" } }),
      prisma.project.count({ where: { organisationId: acting.organisationId, dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "ARCHIVED"] }, archivedAt: null } }),
      prisma.task.count({ where: { organisationId: acting.organisationId, deletedAt: null, status: { not: "DONE" } } }),
      prisma.task.count({ where: { organisationId: acting.organisationId, deletedAt: null, status: "DONE" } }),
      prisma.task.count({ where: { organisationId: acting.organisationId, deletedAt: null, dueDate: { lt: new Date() }, status: { not: "DONE" } } }),
      prisma.helpdeskTicket.count({ where: { organisationId: acting.organisationId, status: { in: ["OPEN", "PENDING", "IN_PROGRESS", "REOPENED"] } } }),
      prisma.helpdeskTicket.count({ where: { organisationId: acting.organisationId, status: { in: ["RESOLVED", "CLOSED"] } } }),
      prisma.workflowDefinition.count({ where: { organisationId: acting.organisationId, status: "ACTIVE" } }),
      prisma.workflowExecution.count({ where: { organisationId: acting.organisationId, status: "SUCCEEDED" } }),
      prisma.workflowExecution.count({ where: { organisationId: acting.organisationId, status: { in: ["FAILED", "DEAD_LETTER"] } } }),
      getWorkforceAnalytics(acting),
    ]);

    return NextResponse.json({
      projects: { active: projectOpen, completed: projectCompleted, overdue: projectOverdue },
      tasks: { open: taskOpen, completed: taskDone, overdue: taskOverdue },
      helpdesk: { open: ticketOpen, resolved: ticketResolved },
      workflows: { active: workflowActive, succeeded: workflowSuccess, failed: workflowFailed },
      workforce,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
