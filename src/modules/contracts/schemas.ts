import { z } from "zod";
import { ContractStatus, ContractTemplateStatus } from "@prisma/client";

export const createContractTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  bodyMarkdown: z.string().min(1).max(50_000),
  status: z.nativeEnum(ContractTemplateStatus).optional(),
});
export type CreateContractTemplateInput = z.infer<typeof createContractTemplateSchema>;

export const updateContractTemplateSchema = createContractTemplateSchema.partial();
export type UpdateContractTemplateInput = z.infer<typeof updateContractTemplateSchema>;

export const listContractTemplatesQuerySchema = z.object({
  status: z.nativeEnum(ContractTemplateStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListContractTemplatesQuery = z.infer<typeof listContractTemplatesQuerySchema>;

export const createContractSchema = z.object({
  title: z.string().min(1).max(200),
  templateId: z.string().min(1).optional(),
  // Required unless templateId is given — the service enforces this (a
  // zod .refine would duplicate the same check twice for no benefit).
  content: z.string().min(1).max(50_000).optional(),
  opportunityId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractStatusSchema = z.object({
  status: z.nativeEnum(ContractStatus),
});
export type UpdateContractStatusInput = z.infer<typeof updateContractStatusSchema>;

/** A new version is how a sent contract is "edited" — same pattern as
 * ProposalVersion; the previous version's content is never mutated. */
export const createContractVersionSchema = z.object({
  content: z.string().min(1).max(50_000),
});
export type CreateContractVersionInput = z.infer<typeof createContractVersionSchema>;

export const createSignatureRequestSchema = z.object({
  signerName: z.string().min(1).max(200),
  signerEmail: z.string().email(),
});
export type CreateSignatureRequestInput = z.infer<typeof createSignatureRequestSchema>;

export const listContractsQuerySchema = z.object({
  status: z.nativeEnum(ContractStatus).optional(),
  opportunityId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export const publicSignContractSchema = z.object({
  signerName: z.string().min(1).max(200),
});
export type PublicSignContractInput = z.infer<typeof publicSignContractSchema>;
