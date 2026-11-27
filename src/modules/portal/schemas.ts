import { z } from "zod";

export const inviteClientPortalUserSchema = z.object({
  clientId: z.string().min(1),
  email: z.string().email(),
  name: z.string().max(200).optional(),
});
export type InviteClientPortalUserInput = z.infer<typeof inviteClientPortalUserSchema>;

export const acceptPortalInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
  name: z.string().max(200).optional(),
});
export type AcceptPortalInviteInput = z.infer<typeof acceptPortalInviteSchema>;

export const portalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

export const requestPortalPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPortalPasswordResetInput = z.infer<typeof requestPortalPasswordResetSchema>;

export const resetPortalPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});
export type ResetPortalPasswordInput = z.infer<typeof resetPortalPasswordSchema>;
