/** Mirrors ServiceItemStatus/ServiceBillingType in prisma/schema.prisma. */
export const SERVICE_ITEM_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const SERVICE_BILLING_TYPES = ["ONE_OFF", "HOURLY", "RECURRING"] as const;
export const SERVICE_COMMERCIAL_MODELS = ["FIXED_PRICE", "HOURLY", "RECURRING", "CUSTOM_QUOTATION"] as const;
export const SERVICE_PACKAGE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
