/**
 * Mirrors the Prisma CRM enums as plain string arrays so client components
 * can render filter/status options without bundling `@prisma/client`. Keep
 * in sync with prisma/schema.prisma.
 */
export const CONTACT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const COMPANY_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
