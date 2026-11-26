export { cn } from "cn"

/** "ACTIVE" -> "Active", "FOLLOW_UP" -> "Follow up" — for rendering any
 * Prisma string enum as a human label without bundling @prisma/client into
 * a client component (see src/modules/identity/roles.ts for the original
 * instance of this pattern). */
export function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}
