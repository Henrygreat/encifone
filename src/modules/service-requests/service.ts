import { Prisma, ServiceRequestStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type { CreateServiceRequestInput, ListServiceRequestsQuery, UpdateServiceRequestInput } from "./schemas";

async function assertServiceRequestInOrg(organisationId: string, id: string) {
  const item = await prisma.serviceRequest.findFirst({ where: { id, organisationId } });
  if (!item) throw new NotFoundError("Service request not found.");
  return item;
}

export async function listServiceRequests(acting: ActiveMembership, query: ListServiceRequestsQuery) {
  requireCapability(acting, Capability.SERVICE_REQUEST_VIEW);

  const where: Prisma.ServiceRequestWhereInput = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.assignedToMe ? { assignedMembershipId: acting.membershipId } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        assignedMembership: { select: { id: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.serviceRequest.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getServiceRequest(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.SERVICE_REQUEST_VIEW);

  const request = await prisma.serviceRequest.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      client: { select: { id: true, name: true } },
      serviceItem: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: "desc" }, take: 100 },
      tickets: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!request) throw new NotFoundError("Service request not found.");
  return request;
}

export async function createServiceRequest(acting: ActiveMembership, input: CreateServiceRequestInput) {
  requireCapability(acting, Capability.SERVICE_REQUEST_MANAGE);

  const request = await prisma.serviceRequest.create({
    data: {
      organisationId: acting.organisationId,
      requesterMembershipId: acting.membershipId,
      clientId: input.clientId,
      serviceItemId: input.serviceItemId,
      projectId: input.projectId,
      assignedTeamId: input.assignedTeamId,
      assignedMembershipId: input.assignedMembershipId,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      urgency: input.urgency,
      status: input.status,
      slaDueAt: input.slaDueAt,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_request.created",
    resourceType: "ServiceRequest",
    resourceId: request.id,
  });

  return request;
}

export async function updateServiceRequest(acting: ActiveMembership, id: string, input: UpdateServiceRequestInput) {
  requireCapability(acting, Capability.SERVICE_REQUEST_MANAGE);
  const existing = await assertServiceRequestInOrg(acting.organisationId, id);

  const request = await prisma.serviceRequest.update({
    where: { id },
    data: {
      ...input,
      resolvedAt: input.status === ServiceRequestStatus.RESOLVED ? new Date() : input.status ? null : undefined,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_request.updated",
    resourceType: "ServiceRequest",
    resourceId: id,
    metadata: { fromStatus: existing.status, toStatus: request.status },
  });

  return request;
}

export async function addServiceRequestComment(
  acting: ActiveMembership,
  serviceRequestId: string,
  body: string,
  isInternal: boolean
) {
  requireCapability(acting, Capability.SERVICE_REQUEST_MANAGE);
  await assertServiceRequestInOrg(acting.organisationId, serviceRequestId);

  const comment = await prisma.serviceRequestComment.create({
    data: {
      serviceRequestId,
      authorMembershipId: acting.membershipId,
      body,
      isInternal,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_request.comment_added",
    resourceType: "ServiceRequest",
    resourceId: serviceRequestId,
  });

  return comment;
}
