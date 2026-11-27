import { AssetOwnershipType, AssetStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listAssetsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(AssetStatus).optional(),
  ownershipType: z.nativeEnum(AssetOwnershipType).optional(),
  clientId: z.string().cuid().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createAssetSchema = z.object({
  categoryId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  assignedMembershipId: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(200),
  reference: z.string().trim().min(1).max(80),
  type: z.string().trim().min(1).max(100),
  ownershipType: z.nativeEnum(AssetOwnershipType).optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  location: z.string().trim().max(200).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCostMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  warrantyUntil: z.coerce.date().optional(),
  renewalDate: z.coerce.date().optional(),
});

export const updateAssetSchema = createAssetSchema.partial();

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
