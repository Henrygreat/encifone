import { z } from "zod";
import {
  ServiceBillingType,
  ServiceCommercialModel,
  ServiceItemStatus,
  ServicePackageStatus,
} from "@prisma/client";

export const createServiceItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  deliverables: z.string().max(4000).optional(),
  categoryId: z.string().cuid().optional(),
  estimatedDeliveryDays: z.number().int().min(0).max(3650).optional(),
  requiredSkills: z.array(z.string().min(1).max(80)).max(30).optional(),
  sku: z.string().max(60).optional(),
  unitPriceMinor: z.number().int().min(0).max(100_000_000_00),
  internalCostMinor: z.number().int().min(0).max(100_000_000_00).optional(),
  currency: z.string().length(3).optional(),
  billingType: z.nativeEnum(ServiceBillingType).optional(),
  commercialModel: z.nativeEnum(ServiceCommercialModel).optional(),
  slaSummary: z.string().max(2000).optional(),
  onboardingRequirements: z.record(z.string(), z.unknown()).optional(),
  documentRequirements: z.record(z.string(), z.unknown()).optional(),
  projectTemplate: z.record(z.string(), z.unknown()).optional(),
  taskTemplate: z.record(z.string(), z.unknown()).optional(),
  isTemplate: z.boolean().optional(),
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

export const setServiceDependenciesSchema = z.object({
  dependencyIds: z.array(z.string().cuid()).max(100),
});
export type SetServiceDependenciesInput = z.infer<typeof setServiceDependenciesSchema>;

export const linkServiceToClientSchema = z.object({
  clientId: z.string().cuid(),
});
export type LinkServiceToClientInput = z.infer<typeof linkServiceToClientSchema>;

export const linkServiceToContractSchema = z.object({
  contractId: z.string().cuid(),
});
export type LinkServiceToContractInput = z.infer<typeof linkServiceToContractSchema>;

export const updateServiceItemPriceSchema = z.object({
  unitPriceMinor: z.number().int().min(0).max(100_000_000_00),
  currency: z.string().length(3).optional(),
});
export type UpdateServiceItemPriceInput = z.infer<typeof updateServiceItemPriceSchema>;

export const listServiceItemsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.nativeEnum(ServiceItemStatus).optional(),
  categoryId: z.string().cuid().optional(),
  billingType: z.nativeEnum(ServiceBillingType).optional(),
  commercialModel: z.nativeEnum(ServiceCommercialModel).optional(),
  templateOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListServiceItemsQuery = z.infer<typeof listServiceItemsQuerySchema>;

export const createServiceCategorySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;

export const updateServiceCategorySchema = createServiceCategorySchema.partial();
export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>;

export const listServiceCategoriesQuerySchema = z.object({
  search: z.string().max(120).optional(),
});
export type ListServiceCategoriesQuery = z.infer<typeof listServiceCategoriesQuerySchema>;

export const createServicePackageSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  categoryId: z.string().cuid().optional(),
  status: z.nativeEnum(ServicePackageStatus).optional(),
  fixedPriceMinor: z.number().int().min(0).max(100_000_000_00).optional(),
  currency: z.string().length(3).optional(),
  estimatedDeliveryDays: z.number().int().min(0).max(3650).optional(),
  items: z
    .array(
      z.object({
        serviceItemId: z.string().cuid(),
        quantity: z.number().int().min(1).max(999).optional(),
      })
    )
    .min(1)
    .max(100),
});
export type CreateServicePackageInput = z.infer<typeof createServicePackageSchema>;

export const updateServicePackageSchema = createServicePackageSchema
  .omit({ items: true })
  .partial();
export type UpdateServicePackageInput = z.infer<typeof updateServicePackageSchema>;

export const listServicePackagesQuerySchema = z.object({
  search: z.string().max(120).optional(),
  status: z.nativeEnum(ServicePackageStatus).optional(),
  categoryId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListServicePackagesQuery = z.infer<typeof listServicePackagesQuerySchema>;

export const createServiceCatalogueSavedViewSchema = z.object({
  name: z.string().min(1).max(100),
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
  shared: z.boolean().optional(),
});
export type CreateServiceCatalogueSavedViewInput = z.infer<typeof createServiceCatalogueSavedViewSchema>;
