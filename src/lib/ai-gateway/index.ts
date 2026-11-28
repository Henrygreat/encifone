import { AIProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { AnthropicAdapter } from "./anthropic-adapter";
import type { AIProviderAdapter, CompletionRequest, CompletionResult } from "./types";

export type { CompletionRequest, CompletionResult } from "./types";

const DEFAULT_MODELS: Record<AIProviderType, string> = {
  ANTHROPIC: "claude-sonnet-5",
  OPENAI: "gpt-5",
  GOOGLE: "gemini-2.5-pro",
  OPENROUTER: "anthropic/claude-sonnet-5",
};

/** Partial by design — only ANTHROPIC has a real adapter today. Resolving
 * an org configured for a provider with no adapter is reported as a
 * logged, non-throwing failure (see completeForOrganisation), never a
 * silent fallback to a different provider the org didn't choose. */
const ADAPTERS: Partial<Record<AIProviderType, AIProviderAdapter>> = {
  ANTHROPIC: new AnthropicAdapter(),
};

function platformKeyFor(provider: AIProviderType): string | undefined {
  switch (provider) {
    case AIProviderType.ANTHROPIC:
      return process.env.ANTHROPIC_API_KEY;
    case AIProviderType.OPENAI:
      return process.env.OPENAI_API_KEY;
    case AIProviderType.GOOGLE:
      return process.env.GOOGLE_AI_API_KEY;
    case AIProviderType.OPENROUTER:
      return process.env.OPENROUTER_API_KEY;
  }
}

interface ResolvedAIConfig {
  provider: AIProviderType;
  model: string;
  apiKey: string;
}

/**
 * An org must explicitly enable AI (AIOrganisationConfig.enabled = true,
 * with a provider chosen) before any feature below ever sends this org's
 * data to a third-party model provider — never on by default, and never
 * inferred from a platform-level key merely existing (docs/AI_ARCHITECTURE.md
 * §10: "org admins can restrict which providers may be used for their
 * org's data"). Returns null — not an error — when nothing is configured;
 * every caller in src/modules/ai/intelligence.ts treats null as "fall back
 * to the deterministic path," never as a reason to throw.
 */
export async function resolveAIConfig(organisationId: string): Promise<ResolvedAIConfig | null> {
  const config = await prisma.aIOrganisationConfig.findUnique({ where: { organisationId } });
  if (!config?.enabled || !config.provider) return null;

  const apiKey = config.encryptedApiKey ? decryptSecret(config.encryptedApiKey) : platformKeyFor(config.provider);
  if (!apiKey) return null;

  return { provider: config.provider, model: config.model ?? DEFAULT_MODELS[config.provider], apiKey };
}

async function logUsage(
  organisationId: string,
  feature: string,
  provider: AIProviderType,
  model: string,
  inputTokens: number,
  outputTokens: number,
  succeeded: boolean,
  errorMessage: string | null
) {
  await prisma.aIUsageLog.create({
    data: { organisationId, feature, provider, model, inputTokens, outputTokens, succeeded, errorMessage },
  });
}

/**
 * The single call-out point for every Phase 2.8 AI feature. Returns null
 * (never throws) when AI isn't configured for this org, the provider has
 * no adapter yet, or the call itself fails — provider failure handling is
 * "log it, tell the caller nothing came back," so a transient Anthropic
 * outage degrades a feature to its deterministic fallback instead of
 * breaking the page.
 */
export async function completeForOrganisation(
  organisationId: string,
  feature: string,
  request: CompletionRequest
): Promise<CompletionResult | null> {
  const resolved = await resolveAIConfig(organisationId);
  if (!resolved) return null;

  const adapter = ADAPTERS[resolved.provider];
  if (!adapter) {
    await logUsage(
      organisationId,
      feature,
      resolved.provider,
      resolved.model,
      0,
      0,
      false,
      `No adapter implemented yet for provider ${resolved.provider}.`
    );
    return null;
  }

  try {
    const result = await adapter.complete(resolved.apiKey, resolved.model, request);
    await logUsage(organisationId, feature, resolved.provider, resolved.model, result.inputTokens, result.outputTokens, true, null);
    return { ...result, provider: resolved.provider, model: resolved.model };
  } catch (error) {
    await logUsage(
      organisationId,
      feature,
      resolved.provider,
      resolved.model,
      0,
      0,
      false,
      request.redactProviderErrors ? "Provider request failed." : error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}

export async function isAIConfigured(organisationId: string): Promise<boolean> {
  return (await resolveAIConfig(organisationId)) !== null;
}
