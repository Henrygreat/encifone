"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoneyMinor } from "@/lib/money";

export function PipelineStageChart({ data }: { data: { stageName: string; valueMinor: number; count: number }[] }) {
  const normalized = data.map((item) => ({
    ...item,
    stageName: item.stageName || "Unspecified",
    valueMinor: Number.isFinite(item.valueMinor) ? item.valueMinor : 0,
    count: Number.isFinite(item.count) ? item.count : 0,
  }));

  return (
    <figure className="min-h-[220px]" aria-label="Pipeline value by stage bar chart">
      <figcaption className="mb-2 text-xs text-muted-foreground">Pipeline value by stage</figcaption>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={normalized} margin={{ left: 0, right: 14, top: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="pipeline-stage-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--module-sales)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="var(--module-intelligence)" stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="stageName"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            interval={0}
            angle={normalized.length > 4 ? -20 : 0}
            textAnchor={normalized.length > 4 ? "end" : "middle"}
            height={normalized.length > 4 ? 44 : 24}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatMoneyMinor(Number(value) || 0, "GBP")}
            width={80}
          />
        <Tooltip
          contentStyle={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: 8 }}
          labelStyle={{ color: "var(--foreground)" }}
          formatter={(value, _name, item) => {
            const valueMinor = typeof value === "number" ? value : Number(value);
            const count = (item?.payload as { count?: number } | undefined)?.count ?? 0;
            return [`${formatMoneyMinor(valueMinor, "GBP")} · ${count} deal${count === 1 ? "" : "s"}`, "Value"];
          }}
        />
          <Bar
          dataKey="valueMinor"
          fill="url(#pipeline-stage-bar)"
          radius={[6, 6, 0, 0]}
          name="Pipeline value"
        >
            <LabelList
              dataKey="count"
              position="top"
              formatter={(value) => {
                const count = typeof value === "number" ? value : Number(value ?? 0);
                return count > 0 ? `${count}` : "";
              }}
              style={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
