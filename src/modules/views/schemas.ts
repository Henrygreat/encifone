import { z } from "zod";
import { ActivityEntityType } from "@prisma/client";

export const createSavedViewSchema = z.object({
  entityType: z.nativeEnum(ActivityEntityType),
  name: z.string().min(1).max(100),
  // Opaque to the server — interpreted by the relevant list page only,
  // never executed as a query string server-side (see prisma/schema.prisma).
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
  // true = org-wide (ownerId null); false/omitted = private to the caller.
  shared: z.boolean().optional(),
});
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;

export const updateSavedViewSchema = createSavedViewSchema.omit({ entityType: true }).partial();
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;

export const listSavedViewsQuerySchema = z.object({
  entityType: z.nativeEnum(ActivityEntityType),
});
export type ListSavedViewsQuery = z.infer<typeof listSavedViewsQuerySchema>;
