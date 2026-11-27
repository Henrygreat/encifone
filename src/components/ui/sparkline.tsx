"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { ModuleKey } from "@/components/app-shell/nav-config";

/**
 * A minimal inline trend line for a MetricCard — no axes, no grid, no
 * tooltip (it's decorative context next to a real number, not a chart to
 * be read on its own). Callers must only ever pass a real historical
 * series; this component has no opinion on where the data came from.
 */
export function Sparkline({
  data,
  accentModule,
  className,
}: {
  data: number[];
  accentModule?: ModuleKey;
  className?: string;
}) {
  const color = accentModule ? `var(--module-${accentModule})` : "var(--primary)";
  const points = data.map((value, index) => ({ index, value }));

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#sparkline-fill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
