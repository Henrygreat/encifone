import {
  BillingInterval,
  ExpenseStatus,
  EstimateStatus,
  InvoiceStatus,
  PaymentMethod,
  SubscriptionStatus,
  RetainerStatus,
  RetainerType,
} from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const financeLineSchema = z.object({
  serviceItemId: z.string().cuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
  unitPriceMinor: z.number().int().min(0).max(2_147_483_647),
  discountMinor: z.number().int().min(0).max(2_147_483_647).default(0),
  taxRateBps: z.number().int().min(0).max(2_147_483_647).max(10000).default(0),
});

export const listEstimatesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(EstimateStatus).optional(),
  clientId: z.string().cuid().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createEstimateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clientId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  opportunityId: z.string().cuid().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  validUntil: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  lines: z.array(financeLineSchema).min(1).max(200),
});

export const updateEstimateSchema = createEstimateSchema.partial().extend({
  status: z.nativeEnum(EstimateStatus).optional(),
});

export const acceptEstimateSchema = z.object({
  autoCreateInvoice: z.boolean().default(true),
  paymentTermsDays: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .max(365)
    .default(30),
});

export const listInvoicesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(InvoiceStatus).optional(),
  clientId: z.string().cuid().optional(),
  overdueOnly: z.stringbool().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createInvoiceSchema = z.object({
  creationKey: z.string().uuid(),
  timeEntryId: z.string().cuid().optional(),
  serviceRequestId: z.string().cuid().optional(),
  estimateId: z.string().cuid().optional(),
  subscriptionId: z.string().cuid().optional(),
  retainerId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  purchaseOrderReference: z.string().trim().max(100).optional(),
  customerReference: z.string().trim().max(100).optional(),
  paymentTermsDays: z
    .number()
    .int()
    .min(0)
    .max(2_147_483_647)
    .max(365)
    .optional(),
  lines: z.array(financeLineSchema).min(1).max(500),
  internalNotes: z.string().trim().max(8000).optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  status: z.nativeEnum(InvoiceStatus).optional(),
});

export const recordPaymentSchema = z.object({
  amountMinor: z.number().int().min(1).max(2_147_483_647),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  method: z.nativeEnum(PaymentMethod),
  externalReference: z.string().trim().max(200).optional(),
  receivedAt: z.coerce.date().optional(),
  allocateToInvoice: z.boolean().default(true),
});

export const createCreditNoteSchema = z.object({
  amountMinor: z.number().int().min(1),
  reason: z.string().trim().min(1).max(2000),
});

export const listExpensesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ExpenseStatus).optional(),
  billableOnly: z.stringbool().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createExpenseSchema = z.object({
  clientId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  supplierName: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  amountMinor: z.number().int().min(0).max(2_147_483_647),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  expenseDate: z.coerce.date(),
  receiptStorageKey: z.string().trim().max(500).optional(),
  isBillable: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceDays: z.number().int().min(1).max(366).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial().extend({
  status: z.nativeEnum(ExpenseStatus).optional(),
});

export const createSubscriptionSchema = z.object({
  clientId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  serviceItemId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200),
  billingInterval: z.nativeEnum(BillingInterval),
  intervalCount: z.number().int().min(1).max(120).default(1),
  amountMinor: z.number().int().min(0).max(2_147_483_647),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  trialEndsAt: z.coerce.date().optional(),
  nextBillingDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
});

export const updateSubscriptionSchema = createSubscriptionSchema
  .partial()
  .extend({
    status: z.nativeEnum(SubscriptionStatus).optional(),
  });

export const subscriptionTransitionSchema = z.object({
  amountMinor: z.number().int().min(0).max(2_147_483_647).optional(),
  action: z.enum(["PAUSE", "RESUME", "CANCEL", "UPGRADE", "DOWNGRADE"]),
  notes: z.string().trim().max(2000).optional(),
});

export const createRetainerSchema = z.object({
  clientId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200),
  type: z.nativeEnum(RetainerType),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  monthlyFeeMinor: z.number().int().min(0).max(2_147_483_647).optional(),
  includedMinutes: z.number().int().min(0).max(2_147_483_647).optional(),
  includedServices: z.record(z.string(), z.unknown()).optional(),
  overageRateMinor: z.number().int().min(0).max(2_147_483_647).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  nextRenewalAt: z.coerce.date().optional(),
  periodStartAt: z.coerce.date().optional(),
  periodEndAt: z.coerce.date().optional(),
});

export const updateRetainerSchema = createRetainerSchema.partial().extend({
  status: z.nativeEnum(RetainerStatus).optional(),
});

export const logRetainerUsageSchema = z.object({
  minutesUsed: z.number().int().min(1).max(2_147_483_647),
  timeEntryId: z.string().cuid().optional(),
  serviceRequestId: z.string().cuid().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const financeForecastQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type ListEstimatesQuery = z.infer<typeof listEstimatesQuerySchema>;
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
export type AcceptEstimateInput = z.infer<typeof acceptEstimateSchema>;

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type SubscriptionTransitionInput = z.infer<
  typeof subscriptionTransitionSchema
>;

export type CreateRetainerInput = z.infer<typeof createRetainerSchema>;
export type UpdateRetainerInput = z.infer<typeof updateRetainerSchema>;
export type LogRetainerUsageInput = z.infer<typeof logRetainerUsageSchema>;

export type FinanceForecastQuery = z.infer<typeof financeForecastQuerySchema>;
