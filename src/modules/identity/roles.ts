/**
 * Mirrors the Prisma `MembershipRole` enum as a plain string array so
 * client components can render role options without bundling `@prisma/client`.
 * Keep in sync with prisma/schema.prisma.
 */
export const MEMBERSHIP_ROLES = [
  "PLATFORM_SUPER_ADMIN",
  "ORGANISATION_OWNER",
  "ORGANISATION_ADMIN",
  "OPERATIONS_MANAGER",
  "SALES_MANAGER",
  "SALES_REPRESENTATIVE",
  "ACCOUNT_MANAGER",
  "FINANCE_MANAGER",
  "PROJECT_MANAGER",
  "TEAM_MEMBER",
  "CONTRACTOR",
  "CLIENT_ADMINISTRATOR",
  "CLIENT_USER",
  "READ_ONLY_AUDITOR",
] as const;

export function formatRoleLabel(role: string): string {
  return role
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}
