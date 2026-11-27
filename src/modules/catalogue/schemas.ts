import { z } from "zod";
import { ServiceBillingType, ServiceItemStatus } from "@prisma/client";

export const createServiceItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sku: z.string().max(60).optional(),
  unitPriceMinor: z.number().int().min(0).max(100_000_000_00),
  currency: z.string().length(3).optional(),
  billingType: z.nativeEnum(ServiceBillingType).optional(),
  status: z.nativeEnum(ServiceItemStatus).optional(),
});
export type CreateServiceItemInput = z.infer<typeof createServiceItemSchema>;

// Price changes go through a dedicated action (see updateServiceItemPrice)
// rather than a plain field update, so every change is captured in
// ServiceItemPriceHistory — never silently overwritten.
export const updateServiceItemSchema = createServiceItemSchema
  .omit({ unitPriceMinor: true, currency: true })
  .partial();
export type UpdateServiceItemInput = z.infer<typeof updateServiceItemSchema>;

export const updateServiceItemPriceSchema = z.object({
  unitPriceMinor: z.number().int().min(0).max(100_000_000_00),
  currency: z.string().length(3).optional(),
});
export type UpdateServiceItemPriceInput = z.infer<typeof updateServiceItemPriceSchema>;

export const listServiceItemsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.nativeEnum(ServiceItemStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListServiceItemsQuery = z.infer<typeof listServiceItemsQuerySchema>;
