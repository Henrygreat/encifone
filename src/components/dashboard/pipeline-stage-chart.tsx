"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoneyMinor } from "@/lib/money";

export function PipelineStageChart({ data }: { data: { stageName: string; valueMinor: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="pipeline-stage-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--module-sales)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--module-sales)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="stageName" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: 8 }}
          labelStyle={{ color: "var(--foreground)" }}
          formatter={(value, _name, item) => {
            const valueMinor = typeof value === "number" ? value : Number(value);
            const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
            return [`${formatMoneyMinor(valueMinor, "GBP")} · ${count} deal${count === 1 ? "" : "s"}`, "Value"];
          }}
        />
        <Area
          type="monotone"
          dataKey="valueMinor"
          stroke="var(--module-sales)"
          strokeWidth={2}
          fill="url(#pipeline-stage-fill)"
          name="Pipeline value"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
