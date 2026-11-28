import { z } from "zod";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { MailProviderError, resendMailbox, verifyMailEvent } from "./email-gateway";
import type { replySchema } from "./service";

export const mailboxSchema = z.object({
  address: z.email().max(254).toLowerCase(),
  apiKey: z.string().trim().min(10).max(300).regex(/^re_[a-zA-Z0-9_-]+$/),
  webhook: z.string().trim().min(16).max(300).regex(/^whsec_[a-zA-Z0-9+/=]+$/),
});

export async function listMailboxes(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  return prisma.inboxMailbox.findMany({
    where: { organisationId: acting.organisationId },
    orderBy: { address: "asc" },
    select: { id: true, publicKey: true, address: true, enabled: true, lastSyncAt: true, lastError: true },
  });
}

export async function configureMailbox(acting: ActiveMembership, input: z.infer<typeof mailboxSchema>) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const organisationId = acting.organisationId;
  const { address } = input;
  const data = { encryptedApiKey: encryptSecret(input.apiKey), encryptedWebhook: encryptSecret(input.webhook), enabled: true, lastError: null };
  await prisma.$transaction(async (tx) => {
    const mailbox = await tx.inboxMailbox.upsert({
      where: { organisationId_address: { organisationId, address } },
      create: { organisationId, address, ...data }, update: data,
    });
    await writeAuditLog({ organisationId, actorUserId: acting.userId, action: "inbox.mailbox_configured",
      resourceType: "InboxMailbox", resourceId: mailbox.id }, tx);
  });
}

export async function manageMailbox(acting: ActiveMembership, id: string, action: "test" | "disable" | "enable" | "disconnect") {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const where = { id, organisationId: acting.organisationId };
  const mailbox = await prisma.inboxMailbox.findFirst({ where });
  if (!mailbox) throw new NotFoundError("Mailbox not found.");
  if (action === "test") {
    if (!mailbox.encryptedApiKey) throw new ValidationError(["Connect the mailbox before testing."]);
    try {
      await resendMailbox(decryptSecret(mailbox.encryptedApiKey)).test();
      await prisma.inboxMailbox.updateMany({ where: { ...where, encryptedApiKey: mailbox.encryptedApiKey }, data: { lastError: null } });
    } catch {
      await prisma.inboxMailbox.updateMany({ where: { ...where, encryptedApiKey: mailbox.encryptedApiKey }, data: { lastError: "Receiving API connection test failed." } });
      throw new ValidationError(["The mailbox connection test failed."]);
    }
    return;
  }
  await prisma.$transaction(async (tx) => {
    const result = await tx.inboxMailbox.updateMany({
      where: { ...where, ...(action === "enable" ? { encryptedApiKey: { not: null }, encryptedWebhook: { not: null } } : {}) },
      data: action === "disconnect" ? { enabled: false, encryptedApiKey: null, encryptedWebhook: null, lastError: null } : { enabled: action === "enable" },
    });
    if (!result.count) throw new ValidationError(["Connect the mailbox before enabling it."]);
    await writeAuditLog({ organisationId: acting.organisationId, actorUserId: acting.userId,
      action: `inbox.mailbox_${action}`, resourceType: "InboxMailbox", resourceId: id }, tx);
  });
}

function mailboxAddress(value: string) {
  return z.email().safeParse((value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase()).data;
}

export class InvalidMailWebhook extends Error {}

export async function receiveMailboxEvent(publicKey: string, raw: string, headers: Headers) {
  const mailbox = await prisma.inboxMailbox.findFirst({ where: { publicKey, enabled: true } });
  if (!mailbox?.encryptedApiKey || !mailbox.encryptedWebhook) throw new NotFoundError("Mailbox not found.");
  let event: ReturnType<typeof verifyMailEvent>;
  try { event = verifyMailEvent(raw, headers, decryptSecret(mailbox.encryptedWebhook)); }
  catch { throw new InvalidMailWebhook(); }
  if (!event) return;
  const providerId = event.data.email_id;
  if (event.type !== "email.received") {
    const delivered = event.type === "email.delivered";
    const failed = ["email.failed", "email.bounced", "email.suppressed"].includes(event.type);
    if (delivered || failed) await prisma.inboxMessage.updateMany({
      where: { mailboxId: mailbox.id, providerId, kind: "OUTBOUND", conversation: { organisationId: mailbox.organisationId },
        delivery: { in: delivered ? ["PENDING", "ACCEPTED"] : ["PENDING", "ACCEPTED", "DELIVERED"] } },
      data: { delivery: failed ? "FAILED" : "DELIVERED" },
    });
    return;
  }
  const key = { mailboxId: mailbox.id, providerId };
  if (await prisma.inboxMessage.findUnique({ where: { mailboxId_providerId: key }, select: { id: true } })) return;
  const email = await resendMailbox(decryptSecret(mailbox.encryptedApiKey)).receive(providerId);
  const sender = mailboxAddress(email.from);
  if (email.id !== providerId || !sender || !email.to.some((item) => mailboxAddress(item) === mailbox.address)) return;
  const references = Object.entries(email.headers ?? {}).find(([name]) => name.toLowerCase() === "in-reply-to")?.[1];
  const inReplyTo = typeof references === "string" ? references.slice(0, 250) : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InboxMailbox" WHERE id = ${mailbox.id} FOR UPDATE`;
    if (!await tx.inboxMailbox.findFirst({ where: { id: mailbox.id, organisationId: mailbox.organisationId, enabled: true,
      encryptedWebhook: mailbox.encryptedWebhook, encryptedApiKey: mailbox.encryptedApiKey } })) return;
    if (await tx.inboxMessage.findUnique({ where: { mailboxId_providerId: key }, select: { id: true } })) return;
    const parent = inReplyTo ? await tx.inboxMessage.findFirst({ where: {
      mailboxId: mailbox.id, internetId: inReplyTo,
      conversation: { organisationId: mailbox.organisationId, customerEmail: sender, status: { not: "ARCHIVED" } },
    }, select: { conversationId: true } }) : null;
    const conversation = parent ? await tx.inboxConversation.update({
      where: { id: parent.conversationId, organisationId: mailbox.organisationId },
      data: { unread: { increment: 1 }, version: { increment: 1 }, status: "OPEN", resolvedAt: null, snoozedUntil: null },
    }) : await tx.inboxConversation.create({ data: {
      organisationId: mailbox.organisationId, mailboxId: mailbox.id, channel: "EMAIL",
      subject: email.subject?.trim() || "Email without a subject", customerEmail: sender, unread: 1, version: 1,
    } });
    await tx.inboxMessage.create({ data: {
      ...key, conversationId: conversation.id, kind: "INBOUND", requestKey: `resend:${providerId}`,
      body: email.text?.trim().slice(0, 24_000) || "This email has no plain-text body. View the original in the connected mailbox.",
      internetId: email.message_id?.slice(0, 250),
    } });
    await tx.inboxMailbox.update({ where: { id: mailbox.id }, data: { lastSyncAt: new Date(), lastError: null } });
  });
}

export async function sendMailboxReply(acting: ActiveMembership, id: string, input: z.infer<typeof replySchema>) {
  requireCapability(acting, Capability.INBOX_MANAGE);
  const where = { id, organisationId: acting.organisationId, channel: "EMAIL" as const };
  const conversation = await prisma.inboxConversation.findFirst({ where, include: { mailbox: true } });
  const mailbox = conversation?.mailbox;
  if (!conversation?.customerEmail || !mailbox?.enabled || !mailbox.encryptedApiKey || mailbox.organisationId !== acting.organisationId ||
      !["OPEN", "PENDING"].includes(conversation.status)) throw new ValidationError(["An active connected mailbox is required to reply."]);
  const key = { conversationId: id, requestKey: input.requestKey };
  const message = await prisma.$transaction(async (tx) => {
    const previous = await tx.inboxMessage.findUnique({ where: { conversationId_requestKey: key } });
    if (previous) {
      if (previous.kind !== "OUTBOUND" || previous.authorId !== acting.membershipId || previous.body !== input.body || previous.mailboxId !== mailbox.id)
        throw new ValidationError(["The request key was already used."]);
      return previous;
    }
    const changed = await tx.inboxConversation.updateMany({
      where: { ...where, version: input.version, status: conversation.status }, data: { version: { increment: 1 } },
    });
    if (!changed.count) throw new ValidationError(["The conversation changed. Review the latest messages before retrying."]);
    return tx.inboxMessage.create({ data: {
      ...key, kind: "OUTBOUND", authorId: acting.membershipId, body: input.body, mailboxId: mailbox.id, delivery: "PENDING",
    } });
  });
  if (message.delivery === "ACCEPTED" || message.delivery === "DELIVERED") return message;
  if (message.delivery === "FAILED" || Date.now() - message.createdAt.getTime() > 22 * 3600_000)
    throw new ValidationError(["This delivery cannot be retried safely. Review the mailbox before sending again."]);
  const parent = await prisma.inboxMessage.findFirst({
    where: { conversationId: id, mailboxId: mailbox.id, kind: "INBOUND", internetId: { not: null } },
    orderBy: { createdAt: "desc" }, select: { internetId: true },
  });
  try {
    const providerId = await resendMailbox(decryptSecret(mailbox.encryptedApiKey)).send({
      from: mailbox.address, to: conversation.customerEmail, subject: /^re:/i.test(conversation.subject) ? conversation.subject : `Re: ${conversation.subject}`,
      body: input.body, requestKey: `inbox/${message.id}`, inReplyTo: parent?.internetId ?? undefined,
    });
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.inboxMessage.updateMany({
        where: { id: message.id, mailboxId: mailbox.id, delivery: "PENDING" }, data: { providerId, delivery: "ACCEPTED" },
      });
      if (changed.count) {
        await tx.inboxConversation.updateMany({ where: { ...where, firstReplyAt: null }, data: { firstReplyAt: new Date() } });
        await writeAuditLog({ organisationId: acting.organisationId, actorUserId: acting.userId,
          action: "inbox.email_accepted", resourceType: "InboxConversation", resourceId: id, metadata: { messageId: message.id },
        }, tx);
      }
      return tx.inboxMessage.findUniqueOrThrow({ where: { id: message.id } });
    });
  } catch (error) {
    if (error instanceof MailProviderError && error.definitive)
      await prisma.inboxMessage.updateMany({ where: { id: message.id, delivery: "PENDING" }, data: { delivery: "FAILED" } });
    throw new ValidationError(["Email delivery was not confirmed. Check the conversation before retrying."]);
  }
}
