import { z } from "zod";
import { OnboardingAssignee, OnboardingStepType } from "@prisma/client";

const templateStepSchema = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  stepType: z.nativeEnum(OnboardingStepType),
  assignedTo: z.nativeEnum(OnboardingAssignee).default(OnboardingAssignee.CLIENT),
  isMandatory: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  dueOffsetDays: z.number().int().min(0).max(3650).optional(),
  // Step-type-specific — e.g. { questionnaire: [{ id, label, required }] }
  // for QUESTIONNAIRE, { requiredCategories: string[] } for DOCUMENT_UPLOAD.
  // Never interpreted beyond what the matching step-type renderer
  // actually implements.
  config: z.record(z.string(), z.unknown()).optional(),
});
export type TemplateStepInput = z.infer<typeof templateStepSchema>;

export const createOnboardingTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().default(false),
  steps: z.array(templateStepSchema).min(1).max(50),
});
export type CreateOnboardingTemplateInput = z.infer<typeof createOnboardingTemplateSchema>;

/** Steps are replaced wholesale on edit — a template isn't versioned the
 * way Proposal/Contract are, since a running onboarding already holds its
 * own denormalised step snapshot (ClientOnboardingStep), so editing the
 * template afterward never changes what a client already sees. */
export const updateOnboardingTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isDefault: z.boolean().optional(),
  steps: z.array(templateStepSchema).min(1).max(50).optional(),
});
export type UpdateOnboardingTemplateInput = z.infer<typeof updateOnboardingTemplateSchema>;

export const startOnboardingSchema = z.object({
  templateId: z.string().min(1),
});
export type StartOnboardingInput = z.infer<typeof startOnboardingSchema>;

export const completeStepSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
});
export type CompleteStepInput = z.infer<typeof completeStepSchema>;

export const reviewStepSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(2000).optional(),
});
export type ReviewStepInput = z.infer<typeof reviewStepSchema>;
