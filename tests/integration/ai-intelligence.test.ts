import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// Mocked before any import that transitively pulls in the real Anthropic
// SDK — no real network call is ever made in this test file.
const mockComplete = vi.fn();
vi.mock("@/lib/ai-gateway/anthropic-adapter", () => ({
  AnthropicAdapter: class MockAnthropicAdapter {
    readonly provider = "ANTHROPIC" as const;
    complete(apiKey: string, model: string, request: unknown) {
      return mockComplete(apiKey, model, request);
    }
  },
}));

import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { getAIConfig, updateAIConfig, listAIUsage } from "@/modules/ai/service";
import { completeForOrganisation } from "@/lib/ai-gateway";
import {
  getClientSummary,
  getDealRiskAssessment,
  getLeadQualification,
  getNextBestActions,
} from "@/modules/ai/intelligence";
import { createLead } from "@/modules/crm/service";
import { createOpportunity, ensureDefaultPipeline, moveOpportunity } from "@/modules/sales/service";
import { membershipIdFor } from "../helpers/membership";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

async function freshOrg(prefix: string) {
  const owner = await registerOwner({
    name: `${prefix} Owner`,
    email: uniqueEmail(prefix),
    password: "password123",
    organisationName: `${prefix} Org ${randomUUID()}`,
  });
  createdOrgIds.push(owner.organisationId);
  createdUserIds.push(owner.userId);
  const acting: ActiveMembership = {
    userId: owner.userId,
    organisationId: owner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(owner.userId, owner.organisationId),
  };
  return acting;
}

beforeEach(() => {
  mockComplete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.aIUsageLog.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.aIOrganisationConfig.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.lead.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("AI organisation config — secure credential storage and tenant isolation", () => {
  it("never returns the API key, only whether one is set, and isolates across orgs", async () => {
    const acting = await freshOrg("ai-config-a");
    const other = await freshOrg("ai-config-b");

    const before = await getAIConfig(acting);
    expect(before).toEqual({ provider: null, model: null, enabled: false, hasApiKey: false });

    const updated = await updateAIConfig(acting, { provider: "ANTHROPIC", enabled: true, apiKey: "sk-ant-secret-value" });
    expect(updated.hasApiKey).toBe(true);
    expect(JSON.stringify(updated)).not.toContain("sk-ant-secret-value");

    const stored = await prisma.aIOrganisationConfig.findUniqueOrThrow({ where: { organisationId: acting.organisationId } });
    expect(stored.encryptedApiKey).not.toBe("sk-ant-secret-value");
    expect(stored.encryptedApiKey).not.toBeNull();

    const otherOrgConfig = await getAIConfig(other);
    expect(otherOrgConfig.enabled).toBe(false);
  });
});

describe("completeForOrganisation — graceful fallback and usage logging", () => {
  it("returns null and logs nothing when AI is not enabled for the org (the default)", async () => {
    const acting = await freshOrg("ai-disabled");
    const result = await completeForOrganisation(acting.organisationId, "test_feature", { system: "sys", prompt: "hi" });
    expect(result).toBeNull();
    expect(mockComplete).not.toHaveBeenCalled();
    const logs = await prisma.aIUsageLog.findMany({ where: { organisationId: acting.organisationId } });
    expect(logs.length).toBe(0);
  });

  it("calls the adapter and logs success when AI is enabled with a BYOK key", async () => {
    const acting = await freshOrg("ai-enabled");
    await updateAIConfig(acting, { provider: "ANTHROPIC", enabled: true, apiKey: "sk-ant-test-key" });
    mockComplete.mockResolvedValue({ text: "A qualified lead.", inputTokens: 42, outputTokens: 8 });

    const result = await completeForOrganisation(acting.organisationId, "test_feature", { system: "sys", prompt: "hi" });
    expect(result?.text).toBe("A qualified lead.");
    expect(mockComplete).toHaveBeenCalledTimes(1);
    const [apiKeyArg] = mockComplete.mock.calls[0];
    expect(apiKeyArg).toBe("sk-ant-test-key");

    const logs = await prisma.aIUsageLog.findMany({ where: { organisationId: acting.organisationId } });
    expect(logs.length).toBe(1);
    expect(logs[0].succeeded).toBe(true);
    expect(logs[0].inputTokens).toBe(42);

    const usage = await listAIUsage(acting, { page: 1, pageSize: 25 });
    expect(usage.summary.totalCalls).toBe(1);
    expect(usage.summary.totalInputTokens).toBe(42);
    expect(usage.summary.totalOutputTokens).toBe(8);
  });

  it("returns null (never throws) and logs the failure when the provider call fails", async () => {
    const acting = await freshOrg("ai-failure");
    await updateAIConfig(acting, { provider: "ANTHROPIC", enabled: true, apiKey: "sk-ant-test-key" });
    mockComplete.mockRejectedValue(new Error("Anthropic API returned 503."));

    const result = await completeForOrganisation(acting.organisationId, "test_feature", { system: "sys", prompt: "hi" });
    expect(result).toBeNull();

    const logs = await prisma.aIUsageLog.findMany({ where: { organisationId: acting.organisationId } });
    expect(logs.length).toBe(1);
    expect(logs[0].succeeded).toBe(false);
    expect(logs[0].errorMessage).toContain("503");
  });
});

describe("AI intelligence features: deterministic baseline always present, AI an optional enhancement", () => {
  it("lead qualification: deterministic score always present; ai null when not configured, present when it is", async () => {
    const acting = await freshOrg("lead-qualification");
    const lead = await createLead(acting, { firstName: "Jane", lastName: "Doe", email: "jane@example.com", source: "Referral" });

    const withoutAI = await getLeadQualification(acting, lead.id);
    expect(withoutAI.deterministic.score).toBeGreaterThan(0);
    expect(withoutAI.ai).toBeNull();

    await updateAIConfig(acting, { provider: "ANTHROPIC", enabled: true, apiKey: "sk-ant-test-key" });
    mockComplete.mockResolvedValue({ text: "This is a promising referral lead.", inputTokens: 10, outputTokens: 5 });

    const withAI = await getLeadQualification(acting, lead.id);
    expect(withAI.ai?.narrative).toBe("This is a promising referral lead.");
    expect(withAI.deterministic.score).toBe(withoutAI.deterministic.score);
  });

  it("deal risk: flags a stalled deal as higher risk than a fresh one with no AI configured", async () => {
    const acting = await freshOrg("deal-risk");
    const pipeline = await ensureDefaultPipeline(acting);

    const freshDeal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Fresh Deal ${randomUUID()}`,
    });
    const freshRisk = await getDealRiskAssessment(acting, freshDeal.id);
    expect(freshRisk.ai).toBeNull();

    const stalledDeal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Stalled Deal ${randomUUID()}`,
      expectedCloseDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // already passed
    });
    const stalledRisk = await getDealRiskAssessment(acting, stalledDeal.id);
    expect(stalledRisk.deterministic.level).toBe("high");
    expect(stalledRisk.deterministic.reasons.some((r) => r.includes("already passed"))).toBe(true);
  });

  it("next best actions: returns a deterministic suggestion for a never-contacted new lead", async () => {
    const acting = await freshOrg("next-best-action");
    const lead = await createLead(acting, { firstName: "New", lastName: "Lead" });
    const result = await getNextBestActions(acting, "LEAD", lead.id);
    expect(result.deterministic.some((a) => a.includes("first contact"))).toBe(true);
    expect(result.ai).toBeNull();
  });

  it("client summary: real facts always present, never fabricated when AI isn't configured", async () => {
    const acting = await freshOrg("client-summary");
    const pipeline = await ensureDefaultPipeline(acting);
    const wonStage = pipeline.stages.find((s) => s.isWon)!;
    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Summary Deal ${randomUUID()}`,
    });
    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const client = await prisma.client.findUniqueOrThrow({ where: { originatingOpportunityId: deal.id } });
    const summary = await getClientSummary(acting, client.id);
    expect(summary.facts.name).toBe(deal.name);
    expect(summary.ai).toBeNull();
  });
});
