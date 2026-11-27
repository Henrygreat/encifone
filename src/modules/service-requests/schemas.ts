import { ServiceRequestPriority, ServiceRequestStatus, ServiceRequestUrgency } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listServiceRequestsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ServiceRequestStatus).optional(),
  priority: z.nativeEnum(ServiceRequestPriority).optional(),
  clientId: z.string().cuid().optional(),
  assignedToMe: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createServiceRequestSchema = z.object({
  clientId: z.string().cuid(),
  serviceItemId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  category: z.string().trim().max(120).optional(),
  priority: z.nativeEnum(ServiceRequestPriority).optional(),
  urgency: z.nativeEnum(ServiceRequestUrgency).optional(),
  status: z.nativeEnum(ServiceRequestStatus).optional(),
  slaDueAt: z.coerce.date().optional(),
  assignedTeamId: z.string().cuid().optional(),
  assignedMembershipId: z.string().cuid().optional(),
});

export const updateServiceRequestSchema = createServiceRequestSchema.partial().extend({
  feedbackScore: z.number().int().min(1).max(5).optional(),
  feedbackComment: z.string().trim().max(2000).optional(),
});

export type ListServiceRequestsQuery = z.infer<typeof listServiceRequestsQuerySchema>;
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequestInput = z.infer<typeof updateServiceRequestSchema>;
