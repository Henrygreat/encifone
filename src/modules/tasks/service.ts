import { Prisma, TaskStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { recomputeProjectProgress } from "@/modules/projects/service";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "./schemas";

async function assertTaskInOrg(organisationId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, organisationId, deletedAt: null } });
  if (!task) throw new NotFoundError("Task not found.");
  return task;
}

async function assertProjectInOrg(organisationId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, organisationId, archivedAt: null } });
  if (!project) throw new NotFoundError("Project not found.");
}

async function assertMembershipInOrg(organisationId: string, id: string) {
  const membership = await prisma.membership.findFirst({ where: { id, organisationId } });
  if (!membership) throw new NotFoundError("Team member not found.");
}

async function upsertTaskLabels(taskId: string, organisationId: string, labels: string[], tx: Prisma.TransactionClient) {
  await tx.taskToLabel.deleteMany({ where: { taskId } });
  if (labels.length === 0) return;

  const ids: string[] = [];
  for (const name of labels) {
    const label = await tx.taskLabel.upsert({
      where: { organisationId_name: { organisationId, name } },
      update: {},
      create: { organisationId, name },
      select: { id: true },
    });
    ids.push(label.id);
  }

  await tx.taskToLabel.createMany({
    data: ids.map((labelId) => ({ taskId, labelId })),
    skipDuplicates: true,
  });
}

export async function listTasks(acting: ActiveMembership, query: ListTasksQuery) {
  requireCapability(acting, Capability.TASK_VIEW);

  const where: Prisma.TaskWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.assignedToMe ? { assignees: { some: { membershipId: acting.membershipId } } } : {}),
    ...(query.overdueOnly ? { dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE } } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        assignees: { include: { membership: { select: { id: true, user: { select: { name: true, email: true } } } } } },
        labels: { include: { label: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function createTask(acting: ActiveMembership, input: CreateTaskInput) {
  requireCapability(acting, Capability.TASK_MANAGE);

  if (input.projectId) await assertProjectInOrg(acting.organisationId, input.projectId);
  for (const assigneeId of input.assigneeIds) await assertMembershipInOrg(acting.organisationId, assigneeId);

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        organisationId: acting.organisationId,
        projectId: input.projectId,
        parentTaskId: input.parentTaskId,
        createdByMembershipId: acting.membershipId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        estimatedMinutes: input.estimatedMinutes,
        approvalRequired: input.approvalRequired ?? false,
      },
    });

    if (input.assigneeIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: input.assigneeIds.map((membershipId) => ({ taskId: created.id, membershipId })),
        skipDuplicates: true,
      });
    }

    await upsertTaskLabels(created.id, acting.organisationId, input.labels, tx);
    return created;
  });

  if (task.projectId) await recomputeProjectProgress(task.projectId);

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "task.created",
    resourceType: "Task",
    resourceId: task.id,
  });

  return task;
}

export async function updateTask(acting: ActiveMembership, id: string, input: UpdateTaskInput) {
  requireCapability(acting, Capability.TASK_MANAGE);

  const existing = await assertTaskInOrg(acting.organisationId, id);
  if (input.projectId) await assertProjectInOrg(acting.organisationId, input.projectId);
  for (const assigneeId of input.assigneeIds ?? []) await assertMembershipInOrg(acting.organisationId, assigneeId);

  const { assigneeIds, labels, ...rest } = input;

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        ...rest,
        completedAt: input.status === TaskStatus.DONE ? new Date() : input.status ? null : undefined,
      },
    });

    if (assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (assigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((membershipId) => ({ taskId: id, membershipId })),
          skipDuplicates: true,
        });
      }
    }

    if (labels) {
      await upsertTaskLabels(id, acting.organisationId, labels, tx);
    }

    return updated;
  });

  if (task.projectId) await recomputeProjectProgress(task.projectId);

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "task.updated",
    resourceType: "Task",
    resourceId: id,
    metadata: { fields: Object.keys(input) },
  });

  return task;
}

export async function archiveTask(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.TASK_MANAGE);

  const existing = await assertTaskInOrg(acting.organisationId, id);
  const task = await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  if (existing.projectId) await recomputeProjectProgress(existing.projectId);

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "task.archived",
    resourceType: "Task",
    resourceId: id,
  });

  return task;
}

export async function getMyWorkSummary(acting: ActiveMembership) {
  requireCapability(acting, Capability.TASK_VIEW);

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const assignedFilter: Prisma.TaskWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    assignees: { some: { membershipId: acting.membershipId } },
  };

  const [assigned, dueToday, upcoming, overdue, blocked, awaitingApproval, recentActivity] = await Promise.all([
    prisma.task.count({ where: assignedFilter }),
    prisma.task.count({ where: { ...assignedFilter, dueDate: { gte: start, lt: end }, status: { not: TaskStatus.DONE } } }),
    prisma.task.count({ where: { ...assignedFilter, dueDate: { gte: end }, status: { not: TaskStatus.DONE } } }),
    prisma.task.count({ where: { ...assignedFilter, dueDate: { lt: now }, status: { not: TaskStatus.DONE } } }),
    prisma.task.count({ where: { ...assignedFilter, status: TaskStatus.BLOCKED } }),
    prisma.task.count({ where: { ...assignedFilter, status: TaskStatus.APPROVAL_PENDING } }),
    prisma.task.findMany({
      where: assignedFilter,
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true, dueDate: true, updatedAt: true, project: { select: { id: true, name: true } } },
    }),
  ]);

  return { assigned, dueToday, upcoming, overdue, blocked, awaitingApproval, recentActivity };
}
