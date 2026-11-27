import { z } from "zod";
import { PaymentStatus } from "@prisma/client";

export const createPaymentIntentSchema = z.object({
  opportunityId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  amountMinor: z.number().int().min(1).max(100_000_000_00),
  currency: z.string().length(3).optional(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const listPaymentsQuerySchema = z.object({
  status: z.nativeEnum(PaymentStatus).optional(),
  opportunityId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
