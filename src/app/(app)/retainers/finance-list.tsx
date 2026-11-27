"use client";

import { FinanceFields } from "@/components/finance/finance-fields";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RetainerRow {
  id: string;
  title: string;
  type: string;
  status: string;
  usedMinutes: number;
  includedMinutes: number | null;
}

export function FinanceList({ canManage }: { canManage: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["retainers"],
    queryFn: async (): Promise<{ items: RetainerRow[] }> => {
      const res = await fetch("/api/v1/retainers");
      if (!res.ok) throw new Error("Could not load retainers.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Retainers" description="Track allowance usage, overages, and renewal cadence." />
      {canManage && <FinanceFields label="New retainer" endpoint="/api/v1/retainers" queryKey="retainers" fields={[{ name: "title", label: "Title" }, { name: "clientId", label: "Client ID", optional: true }, { name: "type", label: "Retainer type", options: ["FIXED_MONTHLY", "HOUR_BASED", "SERVICE_BASED"] }, { name: "currency", label: "Currency", optional: true }, { name: "monthlyFeeMinor", label: "Monthly fee (minor units)", type: "number", optional: true }, { name: "includedMinutes", label: "Included minutes", type: "number", optional: true }, { name: "overageRateMinor", label: "Overage per minute (minor units)", type: "number", optional: true }, { name: "startDate", label: "Start date", type: "date" }, { name: "nextRenewalAt", label: "First renewal date", type: "date", optional: true }]} />}
      {isPending && <p role="status">Loading retainers?</p>}
      {isError && <p role="alert">Could not load retainers.</p>}
      {data?.items.length === 0 && <p className="text-muted-foreground">No retainers yet.</p>}
      <div className="grid gap-3">
        {(data?.items ?? []).map((retainer) => (
          <Card key={retainer.id}>
            <CardHeader>
              <CardTitle>{retainer.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {retainer.type.replaceAll("_", " ")} • {retainer.status} • {retainer.usedMinutes} / {retainer.includedMinutes ?? 0} min
              {canManage && retainer.status === "ACTIVE" && <FinanceFields endpoint={`/api/v1/retainers/${retainer.id}/usage`} queryKey="retainers" label="Log usage" fields={[{ name: "minutesUsed", label: "Minutes used", type: "number", min: 1 }, { name: "note", label: "Note", optional: true }]} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
