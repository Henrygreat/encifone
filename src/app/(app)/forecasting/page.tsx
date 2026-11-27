"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ForecastPeriod {
  month: string;
  expectedCaseMinor: number;
  bestCaseMinor: number;
  worstCaseMinor: number;
  projectedCashFlowMinor: number;
}

interface ForecastResult {
  currency: string;
  periods: ForecastPeriod[];
}

export default function ForecastingPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["finance-forecast"],
    queryFn: async (): Promise<ForecastResult> => {
      const res = await fetch("/api/v1/finance/forecast?months=6");
      if (!res.ok) throw new Error("Could not load forecast.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Forecasting" description="Best-case, expected, and worst-case projections with transparent monthly breakdown." />
      {isPending && <p role="status">Loading finance data?</p>}
      {isError && <p role="alert">Finance data is unavailable.</p>}
      <div className="grid gap-3">
        {(data?.periods ?? []).map((period) => (
          <Card key={period.month}>
            <CardHeader>
              <CardTitle>{period.month}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Expected {money(period.expectedCaseMinor, data?.currency ?? "GBP")} • Best {money(period.bestCaseMinor, data?.currency ?? "GBP")} • Worst {money(period.worstCaseMinor, data?.currency ?? "GBP")} • Cash flow {money(period.projectedCashFlowMinor, data?.currency ?? "GBP")}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
