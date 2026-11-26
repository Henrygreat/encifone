import { z } from "zod";
import { OpportunityStatus } from "@prisma/client";

export const createPipelineStageSchema = z.object({
  name: z.string().min(1).max(120),
  position: z.number().int().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(160),
  isDefault: z.boolean().optional(),
  stages: z.array(createPipelineStageSchema).min(1).max(20).optional(),
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

const tagsSchema = z.array(z.string().min(1).max(60)).max(30);

export const createOpportunitySchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  name: z.string().min(1).max(200),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  valueMinor: z.number().int().min(0).max(100_000_000_00).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional(),
  tags: tagsSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = createOpportunitySchema
  .omit({ pipelineId: true, stageId: true })
  .partial();
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const listOpportunitiesQuerySchema = z.object({
  pipelineId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  status: z.nativeEnum(OpportunityStatus).optional(),
  ownerId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  sortBy: z.enum(["createdAt", "updatedAt", "position", "expectedCloseDate"]).default("position"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;

/** Kanban drag-drop persistence — move to a (possibly new) stage at a given
 * position within that stage's column. */
export const moveOpportunitySchema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().min(0),
  // Only meaningful when the destination stage is flagged isWon/isLost —
  // the service ignores these otherwise.
  wonReason: z.string().max(500).optional(),
  lostReason: z.string().max(500).optional(),
});
export type MoveOpportunityInput = z.infer<typeof moveOpportunitySchema>;
