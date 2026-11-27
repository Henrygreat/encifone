import { z } from "zod";
import { ProposalStatus } from "@prisma/client";

const proposalLineSchema = z.object({
  serviceItemId: z.string().min(1).optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(10_000).optional(),
  unitPriceMinor: z.number().int().min(0).max(100_000_000_00),
});

export const createProposalSchema = z.object({
  title: z.string().min(1).max(200),
  opportunityId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  expiresAt: z.coerce.date().optional(),
  lines: z.array(proposalLineSchema).max(100).optional(),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const updateProposalStatusSchema = z.object({
  status: z.nativeEnum(ProposalStatus),
});
export type UpdateProposalStatusInput = z.infer<typeof updateProposalStatusSchema>;

/** Creating a new version is how a proposal is "edited" after being sent —
 * the previous version is immutable, matching the "versioned document"
 * requirement (docs/MASTER_ROADMAP.md 2.5). */
export const createProposalVersionSchema = z.object({
  lines: z.array(proposalLineSchema).min(1).max(100),
});
export type CreateProposalVersionInput = z.infer<typeof createProposalVersionSchema>;

export const listProposalsQuerySchema = z.object({
  status: z.nativeEnum(ProposalStatus).optional(),
  opportunityId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListProposalsQuery = z.infer<typeof listProposalsQuerySchema>;
