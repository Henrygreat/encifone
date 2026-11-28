import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/core/audit";
import { Capability, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { sendMailboxReply } from "./email";

export const updateConversationSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "ARCHIVED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  snoozedUntil: z.iso.datetime().nullable().optional(),
  markRead: z.literal(true).optional(),
}).strict();

export const replySchema = z.object({
  body: z.string().trim().min(1).max(6000),
  requestKey: z.uuid(),
  version: z.number().int().nonnegative(),
  kind: z.enum(["NOTE", "OUTBOUND"]),
});

export const inboxFilterSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "ARCHIVED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  search: z.string().trim().max(100).optional(),
  tag: z.string().max(40).optional(),
  mine: z.stringbool().optional(),
  unread: z.stringbool().optional(),
  showSnoozed: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function listInbox(acting: ActiveMembership, filter: z.infer<typeof inboxFilterSchema>) {
  requireCapability(acting, Capability.INBOX_VIEW);
  const where: Prisma.InboxConversationWhereInput = {
    organisationId: acting.organisationId,
    status: filter.status,
    priority: filter.priority,
    assigneeId: filter.mine ? acting.membershipId : undefined,
    unread: filter.unread ? { gt: 0 } : undefined,
    tags: filter.tag ? { has: filter.tag } : undefined,
    AND: [
      ...(filter.showSnoozed ? [] : [{ OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }]),
      ...(filter.search ? [{ OR: ["subject", "customerName", "customerEmail"].map((key) =>
        ({ [key]: { contains: filter.search, mode: "insensitive" } })) }] : []),
    ],
  };
  const items = await prisma.inboxConversation.findMany({
    where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (filter.page - 1) * 30, take: 31,
  });
  return { items: items.slice(0, 30), hasNext: items.length > 30 };
}

export async function getInboxConversation(acting: ActiveMembership, id: string, before?: string) {
  requireCapability(acting, Capability.INBOX_VIEW);
  const conversation = await prisma.inboxConversation.findFirst({ where: { id, organisationId: acting.organisationId } });
  if (!conversation) throw new NotFoundError("Conversation not found.");
  const cursor = before ? await prisma.inboxMessage.findFirst({ where: { id: before, conversationId: id }, select: { id: true } }) : null;
  if (before && !cursor) throw new NotFoundError("Message not found.");
  const messages = await prisma.inboxMessage.findMany({
    where: { conversationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    ...(cursor ? { cursor, skip: 1 } : {}),
  });
  const email = conversation.customerEmail;
  const candidates = email && roleHasCapability(acting.role, Capability.CRM_VIEW) ? await prisma.contact.findMany({
    where: {
      organisationId: acting.organisationId, deletedAt: null,
      emails: { array_contains: [{ address: email }] },
    },
    select: { id: true, firstName: true, lastName: true, companyId: true }, take: 2,
  }) : [];
  const contact = candidates.length === 1 ? candidates[0] : null;
  const company = contact?.companyId ? await prisma.company.findFirst({
    where: { id: contact.companyId, organisationId: acting.organisationId, deletedAt: null }, select: { name: true },
  }) : null;
  const previous = email ? await prisma.inboxConversation.findMany({
    where: { organisationId: acting.organisationId, customerEmail: email, id: { not: id } },
    select: { id: true, subject: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8,
  }) : [];
  const organisationId = acting.organisationId;
  const clientFilter = contact ? await prisma.client.findMany({
    where: { organisationId, deletedAt: null, OR: [{ primaryContactId: contact.id }, ...(contact.companyId ? [{ companyId: contact.companyId }] : [])] },
    select: { id: true }, take: 50,
  }) : [];
  const clientIds = clientFilter.map((client) => client.id);
  const [opportunities, projects, tickets, invoices] = await Promise.all([
    contact ? prisma.opportunity.findMany({
      where: { organisationId, status: "OPEN", OR: [{ contactId: contact.id }, ...(contact.companyId ? [{ companyId: contact.companyId }] : [])] },
      select: { id: true, name: true }, orderBy: { updatedAt: "desc" }, take: 5,
    }) : [],
    clientIds.length && roleHasCapability(acting.role, Capability.PROJECT_VIEW) ? prisma.project.findMany({
      where: { organisationId, clientId: { in: clientIds }, archivedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] } },
      select: { id: true, name: true }, orderBy: { updatedAt: "desc" }, take: 5,
    }) : [],
    clientIds.length && roleHasCapability(acting.role, Capability.HELPDESK_VIEW) ? prisma.helpdeskTicket.findMany({
      where: { organisationId, clientId: { in: clientIds }, status: { notIn: ["CLOSED", "RESOLVED"] } },
      select: { id: true, reference: true, subject: true }, orderBy: { updatedAt: "desc" }, take: 5,
    }) : [],
    clientIds.length && roleHasCapability(acting.role, Capability.FINANCE_VIEW) ? prisma.invoice.findMany({
      where: { organisationId, clientId: { in: clientIds }, balanceDueMinor: { gt: 0 }, status: { in: ["FINALISED", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { id: true, invoiceNumber: true, currency: true, balanceDueMinor: true }, orderBy: { dueDate: "asc" }, take: 5,
    }) : [],
  ]);
  return { conversation, messages: messages.slice(0, 50).reverse(), hasOlder: messages.length > 50, contact, company, previous,
    opportunities, projects, tickets, invoices };
}

export async function updateInboxConversation(acting: ActiveMembership, id: string, input: z.infer<typeof updateConversationSchema>) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  const where = { id, organisationId: acting.organisationId };
  return prisma.$transaction(async (tx) => {
    const [current] = await tx.$queryRaw<{ assigneeId: string | null }[]>`SELECT "assigneeId" FROM "InboxConversation"
      WHERE id = ${id} AND "organisationId" = ${acting.organisationId} FOR UPDATE`;
    if (!current) throw new NotFoundError("Conversation not found.");
    if (input.assigneeId && !await tx.membership.findFirst({
      where: { id: input.assigneeId, organisationId: acting.organisationId, status: "ACTIVE" }, select: { id: true },
    })) throw new NotFoundError("Assignee not found.");
    const update = await tx.inboxConversation.updateMany({ where, data: {
      assigneeId: input.assigneeId, tags: input.tags, status: input.status, priority: input.priority,
      snoozedUntil: input.snoozedUntil === undefined ? undefined : input.snoozedUntil ? new Date(input.snoozedUntil) : null,
      unread: input.markRead ? 0 : undefined,
      resolvedAt: input.status === "RESOLVED" ? new Date() : input.status === "OPEN" || input.status === "PENDING" ? null : undefined,
    } });
    if (!update.count) throw new NotFoundError("Conversation not found.");
    if (input.assigneeId && input.assigneeId !== current.assigneeId && input.assigneeId !== acting.membershipId) {
      await tx.notification.create({ data: {
        organisationId: acting.organisationId, recipientType: "MEMBERSHIP", recipientMembershipId: input.assigneeId,
        type: "GENERAL", title: "Inbox conversation assigned", href: `/inbox?conversation=${id}`,
      } });
    }
    if (Object.keys(input).some((key) => key !== "markRead")) await writeAuditLog({
      organisationId: acting.organisationId, actorUserId: acting.userId, action: "inbox.conversation_updated",
      resourceType: "InboxConversation", resourceId: id, metadata: { fields: Object.keys(input) },
    }, tx);
  });
}

export async function replyToConversation(acting: ActiveMembership, id: string, input: z.infer<typeof replySchema>) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  if (input.kind === "OUTBOUND" && await prisma.inboxConversation.findFirst({
    where: { id, organisationId: acting.organisationId, channel: "EMAIL" }, select: { id: true },
  })) return sendMailboxReply(acting, id, input);
  return prisma.$transaction(async (tx) => {
    const where = { id, organisationId: acting.organisationId };
    const conversation = await tx.inboxConversation.findFirst({ where });
    if (!conversation) throw new NotFoundError("Conversation not found.");
    const existing = await tx.inboxMessage.findUnique({
      where: { conversationId_requestKey: { conversationId: id, requestKey: input.requestKey } },
    });
    if (existing) {
      if (existing.authorId !== acting.membershipId || existing.kind !== input.kind || existing.body !== input.body)
        throw new ValidationError(["The request key was already used."]);
      return existing;
    }
    if (input.kind === "OUTBOUND" && (conversation.channel !== "CHAT" || !["OPEN", "PENDING"].includes(conversation.status)))
      throw new ValidationError(["Customer replies require an active website chat."]);
    const changed = await tx.inboxConversation.updateMany({
      where: { ...where, version: input.version, status: conversation.status },
      data: { version: { increment: 1 }, ...(input.kind === "OUTBOUND" ? { firstReplyAt: conversation.firstReplyAt ?? new Date() } : {}) },
    });
    if (!changed.count) throw new ValidationError(["The conversation changed. Review the latest messages before retrying."]);
    const message = await tx.inboxMessage.create({ data: {
      conversationId: id, body: input.body, requestKey: input.requestKey, kind: input.kind, authorId: acting.membershipId,
    } });
    await writeAuditLog({
      organisationId: acting.organisationId, actorUserId: acting.userId, action: "inbox.message_created",
      resourceType: "InboxConversation", resourceId: id, metadata: { kind: input.kind, messageId: message.id },
    }, tx);
    return message;
  });
}
