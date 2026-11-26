import { z } from "zod";
import { ActivityEntityType, ActivityPriority, ActivityStatus, ActivityType } from "@prisma/client";

export const createActivitySchema = z.object({
  entityType: z.nativeEnum(ActivityEntityType),
  entityId: z.string().min(1),
  type: z.nativeEnum(ActivityType),
  subject: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
  dueAt: z.coerce.date().optional(),
  priority: z.nativeEnum(ActivityPriority).optional(),
  ownerId: z.string().min(1).optional(),
  // Optional: tag this activity against a deal even when its primary
  // entity (entityType/entityId) is a Contact/Company.
  opportunityId: z.string().min(1).optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = createActivitySchema
  .omit({ entityType: true, entityId: true })
  .partial()
  .extend({ status: z.nativeEnum(ActivityStatus).optional() });
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const listActivitiesQuerySchema = z.object({
  entityType: z.nativeEnum(ActivityEntityType).optional(),
  entityId: z.string().min(1).optional(),
  type: z.nativeEnum(ActivityType).optional(),
  status: z.nativeEnum(ActivityStatus).optional(),
  ownerId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  // "due at or before this instant" — powers overdue/upcoming views.
  dueBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "dueAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
