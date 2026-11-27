import { Prisma, TicketStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from "./schemas";

async function assertTicketInOrg(organisationId: string, id: string) {
  const ticket = await prisma.helpdeskTicket.findFirst({ where: { id, organisationId } });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  return ticket;
}

async function nextTicketReference(organisationId: string) {
  const count = await prisma.helpdeskTicket.count({ where: { organisationId } });
  return `TKT-${String(count + 1).padStart(6, "0")}`;
}

export async function listTickets(acting: ActiveMembership, query: ListTicketsQuery) {
  requireCapability(acting, Capability.HELPDESK_VIEW);

  const where: Prisma.HelpdeskTicketWhereInput = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.queue ? { queue: query.queue } : {}),
    ...(query.assignedToMe ? { assignedMembershipId: acting.membershipId } : {}),
    ...(query.search
      ? { OR: [{ subject: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { reference: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.helpdeskTicket.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        assignedMembership: { select: { id: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.helpdeskTicket.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getTicket(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.HELPDESK_VIEW);

  const ticket = await prisma.helpdeskTicket.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      comments: { orderBy: { createdAt: "desc" }, take: 100 },
      serviceRequest: { select: { id: true, title: true, status: true } },
      relations: { include: { relatedTicket: { select: { id: true, reference: true, subject: true, status: true } } } },
      mergeSources: true,
    },
  });
  if (!ticket) throw new NotFoundError("Ticket not found.");
  return ticket;
}

export async function createTicket(acting: ActiveMembership, input: CreateTicketInput) {
  requireCapability(acting, Capability.HELPDESK_MANAGE);

  const reference = await nextTicketReference(acting.organisationId);
  const ticket = await prisma.helpdeskTicket.create({
    data: {
      organisationId: acting.organisationId,
      reference,
      serviceRequestId: input.serviceRequestId,
      clientId: input.clientId,
      assetId: input.assetId,
      subject: input.subject,
      description: input.description,
      category: input.category,
      queue: input.queue,
      priority: input.priority,
      severity: input.severity,
      status: input.status,
      slaDueAt: input.slaDueAt,
      assignedTeamId: input.assignedTeamId,
      assignedMembershipId: input.assignedMembershipId,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "ticket.created",
    resourceType: "HelpdeskTicket",
    resourceId: ticket.id,
    metadata: { reference },
  });

  return ticket;
}

export async function updateTicket(acting: ActiveMembership, id: string, input: UpdateTicketInput) {
  requireCapability(acting, Capability.HELPDESK_MANAGE);
  const existing = await assertTicketInOrg(acting.organisationId, id);

  const ticket = await prisma.helpdeskTicket.update({
    where: { id },
    data: {
      ...input,
      firstResponseAt: existing.firstResponseAt ?? (input.status && input.status !== TicketStatus.OPEN ? new Date() : undefined),
      resolvedAt: input.status === TicketStatus.RESOLVED ? new Date() : input.status ? null : undefined,
      closedAt: input.status === TicketStatus.CLOSED ? new Date() : input.status ? null : undefined,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "ticket.updated",
    resourceType: "HelpdeskTicket",
    resourceId: id,
    metadata: { fromStatus: existing.status, toStatus: ticket.status },
  });

  return ticket;
}

export async function addTicketComment(acting: ActiveMembership, ticketId: string, body: string, isInternal: boolean) {
  requireCapability(acting, Capability.HELPDESK_MANAGE);
  await assertTicketInOrg(acting.organisationId, ticketId);

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      authorMembershipId: acting.membershipId,
      body,
      isInternal,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "ticket.comment_added",
    resourceType: "HelpdeskTicket",
    resourceId: ticketId,
  });

  return comment;
}
