import { TimeEntryApprovalStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";

export async function listWorkforceDirectory(acting: ActiveMembership) {
  requireCapability(acting, Capability.WORKFORCE_VIEW);

  return prisma.membership.findMany({
    where: { organisationId: acting.organisationId, status: "ACTIVE" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      membershipProfile: true,
      teamMemberships: { include: { team: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listDepartments(acting: ActiveMembership) {
  requireCapability(acting, Capability.WORKFORCE_VIEW);
  return prisma.department.findMany({ where: { organisationId: acting.organisationId }, orderBy: { name: "asc" } });
}

export async function createDepartment(acting: ActiveMembership, input: { name: string; description?: string }) {
  requireCapability(acting, Capability.WORKFORCE_MANAGE);

  const department = await prisma.department.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      description: input.description,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workforce.department_created",
    resourceType: "Department",
    resourceId: department.id,
  });

  return department;
}

export async function listTeams(acting: ActiveMembership) {
  requireCapability(acting, Capability.WORKFORCE_VIEW);
  return prisma.team.findMany({
    where: { organisationId: acting.organisationId },
    include: { department: true, members: { include: { membership: { include: { user: true } } } } },
    orderBy: { name: "asc" },
  });
}

export async function createTeam(
  acting: ActiveMembership,
  input: { departmentId?: string; name: string; description?: string }
) {
  requireCapability(acting, Capability.WORKFORCE_MANAGE);

  const team = await prisma.team.create({
    data: {
      organisationId: acting.organisationId,
      departmentId: input.departmentId,
      name: input.name,
      description: input.description,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workforce.team_created",
    resourceType: "Team",
    resourceId: team.id,
  });

  return team;
}

export async function assignTeamMember(acting: ActiveMembership, teamId: string, membershipId: string) {
  requireCapability(acting, Capability.WORKFORCE_MANAGE);

  const team = await prisma.team.findFirst({ where: { id: teamId, organisationId: acting.organisationId } });
  if (!team) throw new NotFoundError("Team not found.");

  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organisationId: acting.organisationId } });
  if (!membership) throw new NotFoundError("Team member not found.");

  const link = await prisma.teamMembership.upsert({
    where: { teamId_membershipId: { teamId, membershipId } },
    update: {},
    create: { teamId, membershipId },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workforce.team_member_assigned",
    resourceType: "Team",
    resourceId: teamId,
    metadata: { membershipId },
  });

  return link;
}

export async function updateMembershipProfile(
  acting: ActiveMembership,
  membershipId: string,
  input: { classification?: "EMPLOYEE" | "CONTRACTOR"; skills?: string[]; weeklyCapacityHours?: number }
) {
  requireCapability(acting, Capability.WORKFORCE_MANAGE);

  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organisationId: acting.organisationId } });
  if (!membership) throw new NotFoundError("Team member not found.");

  const profile = await prisma.membershipProfile.upsert({
    where: { membershipId },
    update: input,
    create: {
      organisationId: acting.organisationId,
      membershipId,
      classification: input.classification,
      skills: input.skills,
      weeklyCapacityHours: input.weeklyCapacityHours,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "workforce.profile_updated",
    resourceType: "MembershipProfile",
    resourceId: profile.id,
  });

  return profile;
}

export async function createTimeEntry(
  acting: ActiveMembership,
  input: { taskId?: string; projectId?: string; workDate: Date; minutes: number; isBillable?: boolean; notes?: string }
) {
  requireCapability(acting, Capability.TASK_MANAGE);

  const entry = await prisma.timeEntry.create({
    data: {
      organisationId: acting.organisationId,
      membershipId: acting.membershipId,
      taskId: input.taskId,
      projectId: input.projectId,
      workDate: input.workDate,
      minutes: input.minutes,
      isBillable: input.isBillable ?? true,
      notes: input.notes,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "time_entry.created",
    resourceType: "TimeEntry",
    resourceId: entry.id,
  });

  return entry;
}

export async function approveTimeEntry(acting: ActiveMembership, id: string, approve: boolean) {
  requireCapability(acting, Capability.WORKFORCE_MANAGE);

  const entry = await prisma.timeEntry.findFirst({ where: { id, organisationId: acting.organisationId } });
  if (!entry) throw new NotFoundError("Time entry not found.");

  const updated = await prisma.timeEntry.update({
    where: { id },
    data: {
      approvalStatus: approve ? TimeEntryApprovalStatus.APPROVED : TimeEntryApprovalStatus.REJECTED,
      approvedByMembershipId: acting.membershipId,
      approvedAt: new Date(),
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "time_entry.approved",
    resourceType: "TimeEntry",
    resourceId: id,
    metadata: { approve },
  });

  return updated;
}

export async function getWorkforceAnalytics(acting: ActiveMembership) {
  requireCapability(acting, Capability.ANALYTICS_VIEW);

  const [billableMinutes, nonBillableMinutes, pendingTimesheets, approvedTimesheets] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { organisationId: acting.organisationId, isBillable: true }, _sum: { minutes: true } }),
    prisma.timeEntry.aggregate({ where: { organisationId: acting.organisationId, isBillable: false }, _sum: { minutes: true } }),
    prisma.timeEntry.count({ where: { organisationId: acting.organisationId, approvalStatus: TimeEntryApprovalStatus.PENDING } }),
    prisma.timeEntry.count({ where: { organisationId: acting.organisationId, approvalStatus: TimeEntryApprovalStatus.APPROVED } }),
  ]);

  return {
    billableMinutes: billableMinutes._sum.minutes ?? 0,
    nonBillableMinutes: nonBillableMinutes._sum.minutes ?? 0,
    pendingTimesheets,
    approvedTimesheets,
  };
}
