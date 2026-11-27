import { z } from "zod";
import { MembershipRole } from "@prisma/client";

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  organisationName: z.string().min(1).max(160),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.nativeEnum(MembershipRole),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const switchOrganisationSchema = z.object({
  organisationId: z.string().min(1),
});
export type SwitchOrganisationInput = z.infer<typeof switchOrganisationSchema>;

export const createOrganisationSchema = z.object({
  name: z.string().min(1).max(160),
});
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/** Lead-to-client conversion gating (docs/MASTER_ROADMAP.md 2.7) — both
 * optional so a partial update only touches the field actually sent. */
export const updateOrganisationSettingsSchema = z.object({
  conversionRequiresContract: z.boolean().optional(),
  conversionRequiresPayment: z.boolean().optional(),
  autoStartOnboarding: z.boolean().optional(),
});
export type UpdateOrganisationSettingsInput = z.infer<typeof updateOrganisationSettingsSchema>;
