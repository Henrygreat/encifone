import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";

/**
 * Formalises the "enum status -> Badge variant" pairing every list page
 * in the app was re-declaring as its own local `STATUS_BADGE_VARIANT`
 * record next to a bare `<Badge>` — one component, so the mapping style
 * (and its Aurora UI styling) only needs to change in one place.
 */
export function StatusBadge({
  status,
  variantMap,
  fallbackVariant = "outline",
}: {
  status: string;
  variantMap: Record<string, BadgeVariant>;
  fallbackVariant?: BadgeVariant;
}) {
  return <Badge variant={variantMap[status] ?? fallbackVariant}>{formatEnumLabel(status)}</Badge>;
}
