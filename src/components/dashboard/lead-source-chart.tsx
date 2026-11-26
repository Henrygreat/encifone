"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LeadSourceChart({ data }: { data: { source: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="source"
          width={100}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: 8 }}
          labelStyle={{ color: "var(--foreground)" }}
          formatter={(value: number) => [`${value} lead${value === 1 ? "" : "s"}`, "Count"]}
        />
        <Bar dataKey="count" fill="var(--module-crm)" radius={[0, 4, 4, 0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  );
}
