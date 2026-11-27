import { WorkflowStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listWorkflowDefinitionsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(WorkflowStatus).optional(),
  search: z.string().trim().min(1).optional(),
});

export const createWorkflowDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  triggerEvent: z.string().trim().min(1).max(120),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
  isTemplate: z.boolean().optional(),
  status: z.nativeEnum(WorkflowStatus).optional(),
});

export const updateWorkflowDefinitionSchema = createWorkflowDefinitionSchema.partial();

export const executeWorkflowSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type ListWorkflowDefinitionsQuery = z.infer<typeof listWorkflowDefinitionsQuerySchema>;
export type CreateWorkflowDefinitionInput = z.infer<typeof createWorkflowDefinitionSchema>;
export type UpdateWorkflowDefinitionInput = z.infer<typeof updateWorkflowDefinitionSchema>;
