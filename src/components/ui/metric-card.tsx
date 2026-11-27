import type { ComponentType, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { BentoCard, type BentoCardProps } from "@/components/bento/bento-grid";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/ui/sparkline";

export interface MetricTrend {
  direction: "up" | "down" | "flat";
  /** e.g. "+12% vs last 30 days" — always a real, computed comparison;
   * never render this prop with a fabricated figure (CLAUDE.md rule 4). */
  label: string;
  /** Whether "up" is the good direction for this metric — flips icon
   * colour (e.g. a rising "overdue invoices" count is bad, not good). */
  goodDirection?: "up" | "down";
}

export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  accentModule?: BentoCardProps["accentModule"];
  href?: string;
  trend?: MetricTrend;
  /** A real historical series for this metric, oldest first — omit
   * entirely rather than pass a fabricated one. */
  sparkline?: number[];
  /** Explains how the figure is calculated — shown on hover via a small
   * info affordance, per the brief's "tooltip explaining the metric." */
  tooltip?: string;
  colSpan?: BentoCardProps["colSpan"];
  children?: ReactNode;
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };

/**
 * The dashboard's real-metric card — label, a large value, an optional
 * icon/trend/sparkline/explanatory tooltip, and navigation to the
 * relevant module. Every field is optional except label/value: a metric
 * with no historical data simply renders without a trend or sparkline,
 * never a fabricated one (CLAUDE.md rule 4).
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  accentModule,
  href,
  trend,
  sparkline,
  tooltip,
  colSpan = 3,
  children,
}: MetricCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;
  const good = trend?.goodDirection ?? "up";
  const trendIsPositive = trend && (trend.direction === good || trend.direction === "flat");

  const content = (
    <BentoCard colSpan={colSpan} accentModule={accentModule} className="min-w-0 justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5 text-sm leading-snug text-muted-foreground">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 shrink-0 opacity-60" />
              </TooltipTrigger>
              <TooltipContent className="max-w-56 text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </span>
        {Icon && (
          <Icon
            className="size-4 shrink-0 opacity-70"
            style={accentModule ? { color: `var(--module-${accentModule})` } : undefined}
          />
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0 text-[1.65rem] font-semibold leading-none tracking-tight text-foreground tabular-nums sm:text-[1.85rem]">
          {value}
        </span>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} className="h-8 w-16 shrink-0" accentModule={accentModule} />
        )}
      </div>

      {trend && TrendIcon && (
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: trendIsPositive ? "var(--success)" : "var(--destructive)" }}
        >
          <TrendIcon className="size-3.5" />
          {trend.label}
        </span>
      )}

      {children}
    </BentoCard>
  );

  return href ? <Link href={href} className="block min-w-0">{content}</Link> : content;
}
