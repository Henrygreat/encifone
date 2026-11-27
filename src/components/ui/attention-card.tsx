import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "urgent" | "warning" | "info";
}

const SEVERITY_BADGE_VARIANT: Record<AttentionItem["severity"], "destructive" | "secondary" | "outline"> = {
  urgent: "destructive",
  warning: "secondary",
  info: "outline",
};

/** One row in the "Needs your attention" exception list — every item a
 * real, tenant-scoped signal (src/modules/intelligence/action-centre.ts),
 * never fabricated urgency. */
export function AttentionCard({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-foreground">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
      <Badge variant={SEVERITY_BADGE_VARIANT[item.severity]} className="shrink-0">
        {item.severity}
      </Badge>
    </Link>
  );
}
