import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { encryptSecret } from "@/lib/crypto";
import type { ListAIUsageQuery, UpdateAIConfigInput } from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

/** Never returns encryptedApiKey or a decrypted key — only whether one is
 * set, so the UI can show "API key configured" without ever handling the
 * secret itself after the write that set it. */
export async function getAIConfig(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_VIEW_MEMBERS);

  const config = await prisma.aIOrganisationConfig.findUnique({ where: { organisationId: acting.organisationId } });
  if (!config) {
    return { provider: null, model: null, enabled: false, hasApiKey: false };
  }
  return { provider: config.provider, model: config.model, enabled: config.enabled, hasApiKey: Boolean(config.encryptedApiKey) };
}

export async function updateAIConfig(acting: ActiveMembership, input: UpdateAIConfigInput) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);

  const encryptedApiKey = input.apiKey === undefined ? undefined : input.apiKey === null ? null : encryptSecret(input.apiKey);

  const config = await prisma.aIOrganisationConfig.upsert({
    where: { organisationId: acting.organisationId },
    create: {
      organisationId: acting.organisationId,
      provider: input.provider ?? null,
      model: input.model ?? null,
      enabled: input.enabled ?? false,
      encryptedApiKey: encryptedApiKey ?? null,
    },
    update: {
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
    },
  });

  // Never log the key value itself — only that it changed.
  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "ai_config.updated",
    resourceType: "AIOrganisationConfig",
    resourceId: config.id,
    metadata: {
      fields: Object.keys(input).filter((k) => k !== "apiKey"),
      apiKeyChanged: input.apiKey !== undefined,
    },
  });

  return { provider: config.provider, model: config.model, enabled: config.enabled, hasApiKey: Boolean(config.encryptedApiKey) };
}

export async function listAIUsage(acting: ActiveMembership, query: ListAIUsageQuery) {
  requireCapability(acting, Capability.ORG_VIEW_MEMBERS);

  const where = { organisationId: acting.organisationId };
  const [items, total] = await Promise.all([
    prisma.aIUsageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.aIUsageLog.count({ where }),
  ]);

  const totals = await prisma.aIUsageLog.aggregate({
    where,
    _sum: { inputTokens: true, outputTokens: true },
    _count: { _all: true },
  });

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
    summary: {
      totalCalls: totals._count._all,
      totalInputTokens: totals._sum.inputTokens ?? 0,
      totalOutputTokens: totals._sum.outputTokens ?? 0,
    },
  };
}
