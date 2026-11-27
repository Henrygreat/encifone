import { z } from "zod";
import { AIProviderType } from "@prisma/client";

export const updateAIConfigSchema = z.object({
  provider: z.nativeEnum(AIProviderType).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  // null explicitly clears a bring-your-own-key, falling back to the
  // platform-level key for the chosen provider (if one is configured);
  // omitted (undefined) leaves whatever is already stored untouched.
  apiKey: z.string().min(1).max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateAIConfigInput = z.infer<typeof updateAIConfigSchema>;

export const listAIUsageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListAIUsageQuery = z.infer<typeof listAIUsageQuerySchema>;

export const nextBestActionsQuerySchema = z.object({
  entityType: z.enum(["LEAD", "OPPORTUNITY", "CLIENT"]),
  entityId: z.string().min(1),
});
export type NextBestActionsQuery = z.infer<typeof nextBestActionsQuerySchema>;
