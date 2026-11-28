import { z } from "zod";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";

export const appointmentSchema = z.object({
  staffId: z.string().cuid(),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  startsAt: z.iso.datetime(),
  minutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  remindMinutes: z.number().int().min(0).max(1440).default(15),
  conversationId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
});
export const appointmentRange = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

export async function listAppointments(acting: ActiveMembership, range: z.infer<typeof appointmentRange>) {
  requireCapability(acting, Capability.INBOX_VIEW);
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (+to <= +from || +to - +from > 92 * 86_400_000) throw new ValidationError(["Choose a date range of up to 92 days."]);
  const [items, staff] = await Promise.all([
    prisma.appointment.findMany({ where: { organisationId: acting.organisationId, cancelledAt: null,
      startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: "asc" }, take: 501 }),
    prisma.membership.findMany({ where: { organisationId: acting.organisationId, status: "ACTIVE" },
      select: { id: true, user: { select: { name: true } } } }),
  ]);
  return { items: items.slice(0, 500), capped: items.length > 500, staff };
}

export async function saveAppointment(acting: ActiveMembership, input: z.infer<typeof appointmentSchema>, id?: string) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  const organisationId = acting.organisationId;
  const startsAt = new Date(input.startsAt);
  if (+startsAt <= Date.now()) throw new ValidationError(["Choose a future start time."]);
  const endsAt = new Date(+startsAt + input.minutes * 60_000);
  const bufferedUntil = new Date(+endsAt + input.bufferMinutes * 60_000);
  const reminderAt = input.remindMinutes ? new Date(+startsAt - input.remindMinutes * 60_000) : null;
  return prisma.$transaction(async (tx) => {
    // Booking and rescheduling for the same staff member share this row lock.
    const members = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Membership"
      WHERE id = ${input.staffId} AND "organisationId" = ${organisationId} AND status = 'ACTIVE' FOR NO KEY UPDATE`;
    if (!members.length) throw new NotFoundError("Staff member not found.");
    const scoped = (id: string) => ({ where: { id, organisationId }, select: { id: true } });
    const references = await Promise.all([
      input.contactId ? tx.contact.findFirst(scoped(input.contactId)) : undefined,
      input.companyId ? tx.company.findFirst(scoped(input.companyId)) : undefined,
      input.leadId ? tx.lead.findFirst(scoped(input.leadId)) : undefined,
      input.clientId ? tx.client.findFirst(scoped(input.clientId)) : undefined,
      input.conversationId ? tx.inboxConversation.findFirst(scoped(input.conversationId)) : undefined,
    ]);
    if (references.includes(null)) throw new NotFoundError("A linked appointment record was not found.");
    const current = id ? await tx.appointment.findFirst({
      where: { id, organisationId, cancelledAt: null },
      select: { startsAt: true, staffId: true, reminderAt: true },
    }) : null;
    if (id && !current) throw new NotFoundError("Appointment not found.");
    const collision = await tx.appointment.findFirst({ where: {
      organisationId, staffId: input.staffId, cancelledAt: null, ...(id ? { id: { not: id } } : {}),
      startsAt: { lt: bufferedUntil }, bufferedUntil: { gt: startsAt },
    }, select: { id: true } });
    if (collision) throw new ValidationError(["This staff member already has a booking or buffer during that time."]);
    const data = {
      organisationId, staffId: input.staffId, title: input.title, category: input.category,
      startsAt, endsAt, bufferedUntil, bufferMinutes: input.bufferMinutes, reminderAt,
      remindedAt: current && current.staffId === input.staffId && +current.startsAt === +startsAt &&
        current.reminderAt?.getTime() === reminderAt?.getTime() ? undefined : null,
      contactId: input.contactId, companyId: input.companyId, leadId: input.leadId, clientId: input.clientId, conversationId: input.conversationId,
    };
    const result = id ? await tx.appointment.update({ where: { id, organisationId, cancelledAt: null }, data }) : await tx.appointment.create({ data });
    await writeAuditLog({ organisationId, actorUserId: acting.userId,
      action: id ? "appointment.rescheduled" : "appointment.created", resourceType: "Appointment", resourceId: result.id }, tx);
    return result;
  });
}

export async function cancelAppointment(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.appointment.updateMany({
      where: { id, organisationId: acting.organisationId, cancelledAt: null },
      data: { cancelledAt: new Date(), reminderAt: null },
    });
    if (!changed.count) throw new NotFoundError("Active appointment not found.");
    await writeAuditLog({ organisationId: acting.organisationId, actorUserId: acting.userId, action: "appointment.cancelled",
      resourceType: "Appointment", resourceId: id }, tx);
  });
}

export async function sendDueAppointmentReminders(now = new Date()) {
  const where = { cancelledAt: null, remindedAt: null, reminderAt: { lte: now }, startsAt: { gt: now } };
  const due = await prisma.appointment.findMany({ where, orderBy: { reminderAt: "asc" }, take: 100 });
  for (const item of due) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: { ...where, id: item.id, organisationId: item.organisationId, updatedAt: item.updatedAt },
        data: { remindedAt: now },
      });
      if (!changed.count) return;
      if (!await tx.membership.findFirst({ where: { id: item.staffId, organisationId: item.organisationId, status: "ACTIVE" }, select: { id: true } })) return;
      await tx.notification.create({ data: {
        organisationId: item.organisationId, recipientType: "MEMBERSHIP", recipientMembershipId: item.staffId,
        type: "GENERAL", title: "Upcoming appointment", body: item.title, href: "/calendar",
      } });
    });
  }
}
