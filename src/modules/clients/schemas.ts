import { z } from "zod";
import { ClientLifecycleStage } from "@prisma/client";

export const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  companyId: z.string().min(1).optional(),
  primaryContactId: z.string().min(1).optional(),
  originatingOpportunityId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  tags: z.array(z.string().min(1).max(60)).max(30).optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema
  .omit({ originatingOpportunityId: true })
  .partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const transitionLifecycleSchema = z.object({
  toStage: z.nativeEnum(ClientLifecycleStage),
});
export type TransitionLifecycleInput = z.infer<typeof transitionLifecycleSchema>;

export const listClientsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  lifecycleStage: z.nativeEnum(ClientLifecycleStage).optional(),
  ownerId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
