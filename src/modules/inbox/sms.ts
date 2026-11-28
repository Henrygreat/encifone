import { z } from "zod";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { writeAuditLog } from "@/core/audit";
import { NotFoundError, ValidationError } from "@/lib/api";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { smsNumberSchema, SmsProviderFailure, smsSegmentEstimate, twilioGateway, twilioMessageId, twilioSid, verifyTwilioForm } from "./sms-gateway";
import type { replySchema } from "./service";

export const smsConfiguration = z.object({
  number: smsNumberSchema, accountSid: twilioSid, token: z.string().regex(/^[a-fA-F0-9]{32}$/),
});
export class InvalidSmsWebhook extends Error {}

export async function listSmsNumbers(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  return prisma.inboxSmsNumber.findMany({ where: { organisationId: acting.organisationId },
    select: { id: true, number: true, enabled: true, lastSyncAt: true, publicKey: true }, orderBy: { number: "asc" } });
}

export async function saveSmsNumber(acting: ActiveMembership, input: z.infer<typeof smsConfiguration>) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  if (!await twilioGateway(input.accountSid, input.token).verifyNumber(input.number)) {
    throw new ValidationError(["Twilio did not verify ownership of this SMS-capable number."]);
  }
  const organisationId = acting.organisationId;
  const number = input.number;
  const data = { accountSid: input.accountSid, encryptedToken: encryptSecret(input.token), enabled: true };
  await prisma.$transaction(async (tx) => {
    const record = await tx.inboxSmsNumber.upsert({
      where: { organisationId_number: { organisationId, number } }, update: data, create: { organisationId, number, ...data },
    });
    await writeAuditLog({ organisationId, actorUserId: acting.userId, action: "inbox.sms_number_connected", resourceType: "InboxSmsNumber", resourceId: record.id }, tx);
  });
}

export async function disconnectSmsNumber(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  await prisma.$transaction(async (tx) => {
    const result = await tx.inboxSmsNumber.updateMany({ where: { id, organisationId: acting.organisationId },
      data: { enabled: false, encryptedToken: null } });
    if (!result.count) throw new NotFoundError("Number not found.");
    await writeAuditLog({ organisationId: acting.organisationId, actorUserId: acting.userId,
      action: "inbox.sms_number_disconnected", resourceType: "InboxSmsNumber", resourceId: id }, tx);
  });
}

function webhookUrl(key: string, message?: string) {
  const url = new URL(`/api/v1/webhooks/inbox-sms/${key}`, env.APP_URL);
  if (message) url.searchParams.set("message", message);
  return url.toString();
}

export async function recordTwilioWebhook(key: string, form: URLSearchParams, signature: string, message?: string) {
  const number = await prisma.inboxSmsNumber.findFirst({ where: { publicKey: key, enabled: true } });
  if (!number?.encryptedToken) throw new NotFoundError("Number not found.");
  if (!verifyTwilioForm(decryptSecret(number.encryptedToken), webhookUrl(key, message), form, signature) ||
      form.get("AccountSid") !== number.accountSid) throw new InvalidSmsWebhook();
  const providerId = twilioMessageId.safeParse(form.get("MessageSid")).data;
  if (!providerId) throw new InvalidSmsWebhook();
  const organisationId = number.organisationId;
  const smsNumberId = number.id;
  if (message) {
    if (form.get("From") !== number.number) throw new InvalidSmsWebhook();
    const status = form.get("MessageStatus");
    const delivery = status === "delivered" ? "DELIVERED" : ["failed", "undelivered", "canceled"].includes(status ?? "") ? "FAILED" : null;
    if (delivery) await prisma.inboxMessage.updateMany({
      where: { id: message, smsNumberId, kind: "OUTBOUND", conversation: { organisationId, customerPhone: form.get("To") ?? "" },
        OR: [{ providerId: null }, { providerId }], delivery: { in: ["PENDING", "ACCEPTED"] } },
      data: { delivery, providerId },
    });
    return;
  }
  const from = smsNumberSchema.safeParse(form.get("From")).data;
  const body = form.get("Body")?.slice(0, 3000);
  if (form.get("To") !== number.number || !from) throw new InvalidSmsWebhook();
  if (!body?.trim()) return;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InboxSmsNumber" WHERE id = ${smsNumberId} FOR UPDATE`;
    if (!await tx.inboxSmsNumber.findFirst({ where: { id: smsNumberId, enabled: true, encryptedToken: number.encryptedToken } })) return;
    if (await tx.inboxMessage.findUnique({ where: { smsNumberId_providerId: { smsNumberId, providerId } }, select: { id: true } })) return;
    const keyword = form.get("OptOutType") ?? body.trim().toUpperCase();
    const stop = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"].includes(keyword);
    const start = ["START", "UNSTOP"].includes(keyword);
    const consentKey = { smsNumberId, recipient: from };
    await tx.inboxSmsConsent.upsert({ where: { smsNumberId_recipient: consentKey },
      update: stop ? { optedOut: true } : start ? { optedOut: false } : {}, create: { ...consentKey, optedOut: stop } });
    const current = await tx.inboxConversation.findFirst({
      where: { organisationId, smsNumberId, channel: "SMS", customerPhone: from, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" },
    });
    const thread = current ? await tx.inboxConversation.update({
      where: { id: current.id, organisationId }, data: { unread: { increment: 1 }, version: { increment: 1 }, status: "OPEN", resolvedAt: null, snoozedUntil: null },
    }) : await tx.inboxConversation.create({
      data: { organisationId, smsNumberId, channel: "SMS", subject: "SMS conversation", customerPhone: from, unread: 1, version: 1 },
    });
    await tx.inboxMessage.create({ data: { conversationId: thread.id, kind: "INBOUND", body, smsNumberId, providerId,
      requestKey: `sms:${providerId}`, smsSegments: smsSegmentEstimate(body) } });
    await tx.inboxSmsNumber.update({ where: { id: smsNumberId }, data: { lastSyncAt: new Date() } });
  });
}

export async function sendSmsReply(acting: ActiveMembership, id: string, input: z.infer<typeof replySchema>) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  const organisationId = acting.organisationId;
  const where = { id, organisationId, channel: "SMS" as const };
  const conversation = await prisma.inboxConversation.findFirst({ where, include: { smsNumber: true } });
  const number = conversation?.smsNumber;
  const recipient = conversation?.customerPhone;
  if (!conversation || !number?.enabled || !number.encryptedToken || !recipient || number.organisationId !== organisationId ||
      !["OPEN", "PENDING"].includes(conversation.status)) throw new ValidationError(["An active SMS number is required to reply."]);
  if (input.body.length > 1600) throw new ValidationError(["SMS replies are limited to 1,600 characters."]);
  const { message, created } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InboxSmsNumber" WHERE id = ${number.id} FOR UPDATE`;
    if (!await tx.inboxSmsNumber.findFirst({ where: { id: number.id, enabled: true, encryptedToken: number.encryptedToken } })) {
      throw new ValidationError(["An active SMS number is required to reply."]);
    }
    const consent = await tx.inboxSmsConsent.findUnique({ where: { smsNumberId_recipient: { smsNumberId: number.id, recipient } } });
    if (!consent || consent.optedOut) throw new ValidationError(["The recipient has opted out of SMS or has no recorded consent."]);
    const key = { conversationId: id, requestKey: input.requestKey };
    const previous = await tx.inboxMessage.findUnique({ where: { conversationId_requestKey: key } });
    if (previous) {
      if (previous.authorId !== acting.membershipId || previous.kind !== "OUTBOUND" || previous.body !== input.body) throw new ValidationError(["The request key was already used."]);
      return { message: previous, created: false };
    }
    const changed = await tx.inboxConversation.updateMany({ where: { ...where, version: input.version, status: conversation.status },
      data: { version: { increment: 1 } } });
    if (!changed.count) throw new ValidationError(["The conversation changed. Review the latest messages before retrying."]);
    return { created: true, message: await tx.inboxMessage.create({ data: {
      ...key, smsNumberId: number.id, kind: "OUTBOUND", delivery: "PENDING", body: input.body,
      authorId: acting.membershipId, smsSegments: smsSegmentEstimate(input.body),
    } }) };
  });
  if (!created) return message;
  try {
    const { providerId } = await twilioGateway(number.accountSid, decryptSecret(number.encryptedToken)).send({
      from: number.number, to: recipient, body: input.body, callback: webhookUrl(number.publicKey, message.id),
    });
    return await prisma.$transaction(async (tx) => {
      await tx.inboxMessage.updateMany({ where: { id: message.id, delivery: "PENDING" }, data: { providerId, delivery: "ACCEPTED" } });
      await tx.inboxConversation.updateMany({ where: { ...where, firstReplyAt: null }, data: { firstReplyAt: new Date() } });
      await writeAuditLog({ organisationId, actorUserId: acting.userId, action: "inbox.sms_accepted",
        resourceType: "InboxConversation", resourceId: id, metadata: { messageId: message.id } }, tx);
      return tx.inboxMessage.findUniqueOrThrow({ where: { id: message.id } });
    });
  } catch (error) {
    if (error instanceof SmsProviderFailure && error.definitive) await prisma.inboxMessage.updateMany({ where: { id: message.id, delivery: "PENDING" }, data: { delivery: "FAILED" } });
    throw new ValidationError(["Twilio did not confirm the send. Review delivery before sending again."]);
  }
}
