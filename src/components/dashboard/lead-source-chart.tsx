"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LeadSourceChart({ data }: { data: { source: string; count: number }[] }) {
  return (
    <figure className="min-h-[220px]" aria-label="Lead source distribution chart">
      <figcaption className="mb-2 text-xs text-muted-foreground">Lead source distribution</figcaption>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="lead-source-bar" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--module-crm)" stopOpacity={0.88} />
              <stop offset="100%" stopColor="var(--module-overview)" stopOpacity={0.82} />
            </linearGradient>
          </defs>
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
          formatter={(value) => {
            const count = typeof value === "number" ? value : Number(value);
            return [`${count} lead${count === 1 ? "" : "s"}`, "Count"];
          }}
        />
          <Bar dataKey="count" fill="url(#lead-source-bar)" radius={[0, 4, 4, 0]} name="Leads" />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
