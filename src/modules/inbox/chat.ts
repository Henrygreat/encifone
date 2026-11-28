import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";

const websiteOrigin = z.url().transform((value) => new URL(value)).refine((url) =>
  !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash &&
  (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))),
).transform((url) => url.origin);
export const widgetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  widgetName: z.string().trim().min(1).max(80).optional(),
  welcome: z.string().trim().min(1).max(300),
  colour: z.string().regex(/^#[0-9a-f]{6}$/i),
  origins: z.array(websiteOrigin).min(1).max(20),
  privacyNotice: z.string().trim().min(1).max(500),
  position: z.enum(["left", "right"]),
  enabled: z.boolean(),
});

export async function listWidgetSettings(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  return prisma.chatWidget.findMany({ where: { organisationId: acting.organisationId }, orderBy: [{ widgetName: "asc" }, { id: "asc" }] });
}

export async function saveWidget(acting: ActiveMembership, input: z.infer<typeof widgetSchema>, publicKey?: string) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const organisationId = acting.organisationId;
  return prisma.$transaction(async (tx) => {
    const widget = publicKey
      ? await tx.chatWidget.update({ where: { publicKey, organisationId }, data: input })
      : await tx.chatWidget.create({ data: { organisationId, ...input } });
    await writeAuditLog({
      organisationId, actorUserId: acting.userId, action: "inbox.widget_updated", resourceType: "ChatWidget", resourceId: widget.id,
    }, tx);
    return widget;
  });
}

export async function recordWidgetConnection(widget: { id: string; lastConnectedAt: Date | null }, origin: string) {
  const now = new Date();
  const cutoff = new Date(+now - 5 * 60_000);
  if (widget.lastConnectedAt && widget.lastConnectedAt > cutoff) return;
  await prisma.chatWidget.updateMany({
    where: { id: widget.id, enabled: true, origins: { has: origin }, OR: [{ lastConnectedAt: null }, { lastConnectedAt: { lte: cutoff } }] },
    data: { lastConnectedAt: now, lastConnectedOrigin: origin },
  });
}

export async function findPublicWidget(key: string, origin: string) {
  if (!z.uuid().safeParse(key).success || !origin) throw new NotFoundError("Chat is unavailable.");
  const widget = await prisma.chatWidget.findFirst({ where: { publicKey: key, enabled: true, origins: { has: origin } } });
  if (!widget) throw new NotFoundError("Chat is unavailable.");
  return widget;
}

type Widget = Awaited<ReturnType<typeof findPublicWidget>>;
const signature = (widget: Widget, nonce: string) => createHmac("sha256", env.AUTH_SECRET)
  .update(`chat-visitor:v1:${widget.publicKey}:${nonce}`).digest();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const visitorToken = z.string().regex(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
const body = z.string().trim().min(1).max(3000);

export const chatActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), name: z.string().trim().max(100).optional(), email: z.email().max(254).optional(), body }),
  z.object({ action: z.literal("poll"), token: visitorToken, after: z.string().cuid().optional() }),
  z.object({ action: z.literal("message"), token: visitorToken, body, requestKey: z.uuid() }),
]);

export async function runChatAction(widget: Widget, input: z.infer<typeof chatActionSchema>) {
  if (input.action === "start") {
    const nonce = randomBytes(32).toString("base64url");
    const token = `${nonce}.${signature(widget, nonce).toString("base64url")}`;
    await prisma.$transaction(async (tx) => {
      const conversation = await tx.inboxConversation.create({ data: {
        organisationId: widget.organisationId, channel: "CHAT", subject: "Website chat", unread: 1, version: 1,
        customerName: input.name, customerEmail: input.email?.toLowerCase(),
        messages: { create: { kind: "INBOUND", body: input.body, requestKey: "initial" } },
      } });
      await tx.chatVisitor.create({ data: { widgetId: widget.id, conversationId: conversation.id,
        tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
    });
    return { token };
  }
  const [nonce, mac] = input.token.split(".");
  if (!timingSafeEqual(signature(widget, nonce), Buffer.from(mac, "base64url"))) throw new NotFoundError("Chat session unavailable.");
  const visitor = await prisma.chatVisitor.findFirst({
    where: { tokenHash: tokenHash(input.token), widgetId: widget.id, expiresAt: { gt: new Date() },
      conversation: { organisationId: widget.organisationId, channel: "CHAT" } },
    select: { conversationId: true },
  });
  if (!visitor) throw new NotFoundError("Chat session unavailable.");
  const conversationId = visitor.conversationId;
  if (input.action === "poll") {
    const cursor = input.after ? await prisma.inboxMessage.findFirst({
      where: { id: input.after, conversationId, kind: { not: "NOTE" } }, select: { id: true },
    }) : null;
    if (input.after && !cursor) throw new NotFoundError("Message not found.");
    const conversation = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conversationId, organisationId: widget.organisationId }, select: { status: true },
    });
    const messages = await prisma.inboxMessage.findMany({
      where: { conversationId, kind: { not: "NOTE" } }, select: { id: true, body: true, kind: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, ...(cursor ? { cursor, skip: 1 } : {}),
    });
    return { messages, closed: conversation.status === "RESOLVED" || conversation.status === "ARCHIVED" };
  }
  return prisma.$transaction(async (tx) => {
    const change = await tx.inboxConversation.updateMany({
      where: { id: conversationId, organisationId: widget.organisationId, status: { in: ["OPEN", "PENDING"] } },
      data: { unread: { increment: 1 }, version: { increment: 1 }, snoozedUntil: null },
    });
    if (!change.count) throw new ValidationError(["This conversation is closed. Start another conversation to contact the team."]);
    const inserted = await tx.inboxMessage.createMany({ skipDuplicates: true, data: [
      { conversationId, body: input.body, kind: "INBOUND", requestKey: `visitor:${input.requestKey}` },
    ] });
    if (!inserted.count) await tx.inboxConversation.update({
      where: { id: conversationId }, data: { unread: { decrement: 1 }, version: { decrement: 1 } },
    });
    return { accepted: true };
  });
}
