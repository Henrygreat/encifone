"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Metrics {
  currency: string;
  totalInvoicedRevenueMinor: number;
  outstandingReceivablesMinor: number;
  overdueReceivablesMinor: number;
  receivableAgeing: { currentMinor: number; d1to30Minor: number; d31to60Minor: number; d61plusMinor: number };
  audit: Array<{ id: string; action: string; resourceType: string; resourceId: string | null; createdAt: string }>;
  collectedRevenueMinor: number;
  operatingExpensesMinor: number;
  grossProfitMinor: number;
  grossMargin: number | null;
  averageRevenuePerClientMinor: number;
}

export default function ProfitabilityPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["finance-metrics"],
    queryFn: async (): Promise<Metrics> => {
      const res = await fetch("/api/v1/finance/metrics");
      if (!res.ok) throw new Error("Could not load profitability metrics.");
      return res.json();
    },
  });

  const items = [
    { label: "Net invoiced", value: money(data?.totalInvoicedRevenueMinor, data?.currency ?? "GBP") },
    { label: "Outstanding receivables", value: money(data?.outstandingReceivablesMinor, data?.currency ?? "GBP") },
    { label: "Overdue receivables", value: money(data?.overdueReceivablesMinor, data?.currency ?? "GBP") },
    { label: "Collected revenue", value: money(data?.collectedRevenueMinor ?? 0, data?.currency ?? "GBP") },
    { label: "Operating expenses", value: money(data?.operatingExpensesMinor ?? 0, data?.currency ?? "GBP") },
    { label: "Operating surplus", value: money(data?.grossProfitMinor ?? 0, data?.currency ?? "GBP") },
    { label: "Operating margin", value: data?.grossMargin == null ? "-" : `${Math.round(data.grossMargin * 100)}%` },
    { label: "Avg revenue/client", value: money(data?.averageRevenuePerClientMinor ?? 0, data?.currency ?? "GBP") },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Profitability" description="Base-currency reporting from recorded collections, issued invoices and approved expenses." />
      {isPending && <p role="status">Loading finance data.</p>}
      {isError && <p role="alert">Finance data is unavailable.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data && items.map((item) => (
          <Card key={item.label}>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold">{item.value}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
