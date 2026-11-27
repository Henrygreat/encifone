import { Prisma, ProjectStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from "./schemas";

async function assertMembershipInOrg(organisationId: string, membershipId: string) {
  const member = await prisma.membership.findFirst({ where: { id: membershipId, organisationId } });
  if (!member) throw new NotFoundError("Team member not found.");
}

async function assertProjectInOrg(organisationId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, organisationId, archivedAt: null } });
  if (!project) throw new NotFoundError("Project not found.");
  return project;
}

export async function listProjects(acting: ActiveMembership, query: ListProjectsQuery) {
  requireCapability(acting, Capability.PROJECT_VIEW);

  const where: Prisma.ProjectWhereInput = {
    organisationId: acting.organisationId,
    archivedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.health ? { health: query.health } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        projectManager: { select: { id: true, user: { select: { name: true, email: true } } } },
        _count: { select: { tasks: true, milestones: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getProject(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.PROJECT_VIEW);

  const project = await prisma.project.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      client: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      primaryContact: { select: { id: true, firstName: true, lastName: true } },
      projectManager: { select: { id: true, user: { select: { name: true, email: true } } } },
      members: {
        include: { membership: { select: { id: true, user: { select: { name: true, email: true } }, role: true } } },
      },
      milestones: { orderBy: { dueDate: "asc" } },
      risksIssues: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { tasks: true, serviceRequests: true, timeEntries: true } },
    },
  });
  if (!project) throw new NotFoundError("Project not found.");
  return project;
}

export async function createProject(acting: ActiveMembership, input: CreateProjectInput) {
  requireCapability(acting, Capability.PROJECT_MANAGE);

  if (input.projectManagerId) await assertMembershipInOrg(acting.organisationId, input.projectManagerId);
  for (const memberId of input.memberIds) await assertMembershipInOrg(acting.organisationId, memberId);

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        organisationId: acting.organisationId,
        clientId: input.clientId,
        companyId: input.companyId,
        primaryContactId: input.primaryContactId,
        sourceProposalId: input.sourceProposalId,
        sourceContractId: input.sourceContractId,
        sourceServiceItemId: input.sourceServiceItemId,
        name: input.name,
        description: input.description,
        status: input.status ?? ProjectStatus.DRAFT,
        priority: input.priority,
        health: input.health,
        startDate: input.startDate,
        dueDate: input.dueDate,
        budgetMinor: input.budgetMinor,
        estimatedCostMinor: input.estimatedCostMinor,
        currency: input.currency,
        projectManagerId: input.projectManagerId,
        isClientVisible: input.isClientVisible ?? false,
      },
    });

    if (input.memberIds.length > 0) {
      await tx.projectMember.createMany({
        data: input.memberIds.map((membershipId) => ({ projectId: created.id, membershipId })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "project.created",
    resourceType: "Project",
    resourceId: project.id,
  });

  return project;
}

export async function updateProject(acting: ActiveMembership, id: string, input: UpdateProjectInput) {
  requireCapability(acting, Capability.PROJECT_MANAGE);
  await assertProjectInOrg(acting.organisationId, id);

  if (input.projectManagerId) await assertMembershipInOrg(acting.organisationId, input.projectManagerId);
  if (input.memberIds) {
    for (const memberId of input.memberIds) await assertMembershipInOrg(acting.organisationId, memberId);
  }

  const { memberIds, ...rest } = input;

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id }, data: rest });
    if (memberIds) {
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (memberIds.length > 0) {
        await tx.projectMember.createMany({
          data: memberIds.map((membershipId) => ({ projectId: id, membershipId })),
          skipDuplicates: true,
        });
      }
    }
    return updated;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "project.updated",
    resourceType: "Project",
    resourceId: id,
    metadata: { fields: Object.keys(input) },
  });

  return project;
}

export async function archiveProject(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.PROJECT_MANAGE);
  await assertProjectInOrg(acting.organisationId, id);

  const project = await prisma.project.update({
    where: { id },
    data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "project.archived",
    resourceType: "Project",
    resourceId: id,
  });

  return project;
}

export async function recomputeProjectProgress(projectId: string) {
  const [total, completed] = await Promise.all([
    prisma.task.count({ where: { projectId, deletedAt: null } }),
    prisma.task.count({ where: { projectId, status: "DONE", deletedAt: null } }),
  ]);

  const progressPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
  await prisma.project.update({ where: { id: projectId }, data: { progressPercent } });
  return progressPercent;
}
