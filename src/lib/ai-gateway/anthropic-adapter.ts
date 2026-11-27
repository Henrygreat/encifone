import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCompletionResult, AIProviderAdapter, CompletionRequest } from "./types";

/**
 * The only provider adapter actually implemented today — AI_DEFAULT_PROVIDER
 * in .env.example defaults to "anthropic". OpenAI/Google/OpenRouter are
 * modelled in the AIProviderType enum (an org can select them) but have no
 * adapter yet — resolveAIConfig in src/lib/ai-gateway/index.ts reports that
 * honestly rather than silently falling through to this one.
 */
export class AnthropicAdapter implements AIProviderAdapter {
  readonly provider = "ANTHROPIC" as const;

  async complete(apiKey: string, model: string, request: CompletionRequest): Promise<AdapterCompletionResult> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 1024,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
