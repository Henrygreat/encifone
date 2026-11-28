import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { getAIConfig } from "@/modules/ai/service";
import { requireCapability } from "@/modules/operations/auth";
import { listMailboxes } from "./email";
import { listSmsNumbers } from "./sms";

export async function getIntegrationOverview(acting: ActiveMembership, now = new Date()) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const organisationId = acting.organisationId;
  const messages = { conversation: { organisationId }, createdAt: { gte: since, lte: now } };
  const [mailboxes, numbers, widgets, ai, sent, received, failed] = await Promise.all([
    listMailboxes(acting),
    listSmsNumbers(acting),
    prisma.chatWidget.findMany({ where: { organisationId }, select: { name: true, widgetName: true, enabled: true, lastConnectedAt: true }, orderBy: { name: "asc" } }),
    getAIConfig(acting),
    prisma.inboxMessage.count({ where: { ...messages, kind: "OUTBOUND", OR: [{ delivery: null }, { delivery: { in: ["ACCEPTED", "DELIVERED"] } }] } }),
    prisma.inboxMessage.count({ where: { ...messages, kind: "INBOUND" } }),
    prisma.inboxMessage.count({ where: { ...messages, kind: "OUTBOUND", delivery: "FAILED" } }),
  ]);
  const activeChannels = [mailboxes, numbers, widgets].filter((items) => items.some((item) => item.enabled)).length;
  const aiActive = ai.enabled && ai.provider === "ANTHROPIC" && ai.hasApiKey;
  const emailConnected = mailboxes.some((item) => item.enabled && !item.lastError);
  const smsConnected = numbers.some((item) => item.enabled);
  const widgetConnected = widgets.some((item) => item.enabled && item.lastConnectedAt);
  return {
    mailboxes, numbers, widgets, ai, aiActive,
    metrics: {
      providers: [emailConnected, smsConnected, widgetConnected, aiActive].filter(Boolean).length,
      activeChannels, sent, received, failed,
      attention: mailboxes.filter((mailbox) => mailbox.enabled && mailbox.lastError).length +
        widgets.filter((widget) => widget.enabled && !widget.lastConnectedAt).length + Number(ai.enabled && !aiActive),
    },
  };
}
