import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { ModuleKey } from "@/components/app-shell/nav-config";

/**
 * Responsive, asymmetric 12-column Bento dashboard grid — see
 * docs/DESIGN_SYSTEM.md §4. Cards declare their own footprint via
 * `colSpan` (3/4/6/8/12 of the 12-col grid) and `rowSpan` (1-3); the grid
 * itself just lays them out. Collapses to a 6-col grid at `sm` and a
 * single column below that — every `colSpan` value maps to a sensible
 * narrower span at each breakpoint rather than just clamping to 100%.
 * Widget *content* is intentionally not part of this file.
 */
export function BentoGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-5", className)}>
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

const COL_SPAN: Record<2 | 3 | 4 | 5 | 6 | 8 | 12, string> = {
  2: "sm:col-span-1 lg:col-span-2",
  3: "sm:col-span-1 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
  5: "sm:col-span-2 lg:col-span-5",
  6: "sm:col-span-2 lg:col-span-6",
  8: "sm:col-span-2 lg:col-span-8",
  12: "sm:col-span-2 lg:col-span-12",
};

const ROW_SPAN: Record<1 | 2 | 3, string> = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
};

export interface BentoCardProps extends React.ComponentProps<"div"> {
  colSpan?: 2 | 3 | 4 | 5 | 6 | 8 | 12;
  rowSpan?: 1 | 2 | 3;
  /** Tints the card's top accent bar and any icon passed via `accentSlot`. */
  accentModule?: ModuleKey;
  /** Subtle glassmorphism + gradient border — used sparingly (the hero
   * welcome card, the AI insights card), never as the default card style. */
  variant?: "default" | "glass";
}

/**
 * A Bento cell. Deliberately thin — most widgets compose their own header
 * (icon + title + optional trend) and body inside `children`; this just
 * provides the sizing, the subtle accent bar, and consistent padding/surface.
 */
export function BentoCard({
  className,
  colSpan = 4,
  rowSpan = 1,
  accentModule,
  variant = "default",
  children,
  ...props
}: BentoCardProps) {
  const accent = accentModule ? MODULE_VAR[accentModule] : undefined;
  return (
    <Card
      className={cn(
        "relative flex min-w-0 flex-col gap-3 p-5",
        COL_SPAN[colSpan],
        ROW_SPAN[rowSpan],
        variant === "glass" && "glass-panel gradient-border shadow-elevated",
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
