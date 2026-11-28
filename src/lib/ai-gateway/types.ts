import type { AIProviderType } from "@prisma/client";

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  redactProviderErrors?: boolean;
}

export interface AdapterCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult extends AdapterCompletionResult {
  provider: AIProviderType;
  model: string;
}

/** One adapter per provider — docs/ARCHITECTURE.md's ai-gateway design.
 * No application code outside this module calls a provider SDK directly. */
export interface AIProviderAdapter {
  readonly provider: AIProviderType;
  complete(apiKey: string, model: string, request: CompletionRequest): Promise<AdapterCompletionResult>;
}
