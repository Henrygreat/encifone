import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { ModuleKey } from "@/components/app-shell/nav-config";

/**
 * Responsive Bento dashboard grid — see docs/DESIGN_SYSTEM.md §4. Cards
 * declare their own size via `colSpan`/`rowSpan` (1-4 columns on desktop,
 * collapsing to a single column on mobile); the grid itself just lays them
 * out. Widget *content* is intentionally not part of this file — this is
 * the structural layer the dashboard widget registry (Milestone D) builds
 * on top of.
 */
export function BentoGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

const MODULE_VAR: Record<ModuleKey, string> = {
  overview: "var(--module-overview)",
  crm: "var(--module-crm)",
  sales: "var(--module-sales)",
  work: "var(--module-work)",
  intelligence: "var(--module-intelligence)",
  admin: "var(--module-admin)",
};

const COL_SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

const ROW_SPAN: Record<1 | 2, string> = {
  1: "row-span-1",
  2: "row-span-2",
};

export interface BentoCardProps extends React.ComponentProps<"div"> {
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
  /** Tints the card's top accent bar and any icon passed via `accentSlot`. */
  accentModule?: ModuleKey;
}

/**
 * A Bento cell. Deliberately thin — most widgets compose their own header
 * (icon + title + optional trend) and body inside `children`; this just
 * provides the sizing, the subtle accent bar, and consistent padding/surface.
 */
export function BentoCard({
  className,
  colSpan = 1,
  rowSpan = 1,
  accentModule,
  children,
  ...props
}: BentoCardProps) {
  const accent = accentModule ? MODULE_VAR[accentModule] : undefined;
  return (
    <Card
      className={cn(
        "relative flex flex-col gap-3 p-5",
        COL_SPAN[colSpan],
        ROW_SPAN[rowSpan],
        className
      )}
      {...props}
    >
      {accent ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl"
          style={{ background: accent }}
        />
      ) : null}
      {children}
    </Card>
  );
}

/** Empty state for a widget with no data yet — never fabricate figures (CLAUDE.md rule 4). */
export function BentoEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
