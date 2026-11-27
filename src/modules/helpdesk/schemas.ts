import { TicketPriority, TicketSeverity, TicketStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listTicketsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  queue: z.string().trim().min(1).optional(),
  assignedToMe: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createTicketSchema = z.object({
  serviceRequestId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  assetId: z.string().cuid().optional(),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  category: z.string().trim().max(120).optional(),
  queue: z.string().trim().max(120).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  severity: z.nativeEnum(TicketSeverity).optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  slaDueAt: z.coerce.date().optional(),
  assignedTeamId: z.string().cuid().optional(),
  assignedMembershipId: z.string().cuid().optional(),
});

export const updateTicketSchema = createTicketSchema.partial().extend({
  csatScore: z.number().int().min(1).max(5).optional(),
});

export const addTicketCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  isInternal: z.boolean().default(true),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
