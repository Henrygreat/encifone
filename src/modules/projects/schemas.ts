import { ProjectHealth, ProjectPriority, ProjectStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listProjectsQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  health: z.nativeEnum(ProjectHealth).optional(),
  clientId: z.string().cuid().optional(),
});

export const createProjectSchema = z.object({
  clientId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  primaryContactId: z.string().cuid().optional(),
  sourceProposalId: z.string().cuid().optional(),
  sourceContractId: z.string().cuid().optional(),
  sourceServiceItemId: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  health: z.nativeEnum(ProjectHealth).optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  budgetMinor: z.number().int().min(0).optional(),
  estimatedCostMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  projectManagerId: z.string().cuid().optional(),
  isClientVisible: z.boolean().optional(),
  memberIds: z.array(z.string().cuid()).default([]),
});

export const updateProjectSchema = createProjectSchema.partial();

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
