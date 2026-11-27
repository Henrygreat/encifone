"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { FinanceAction, FinanceDocumentForm } from "@/components/finance/document-actions";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EstimateRow {
  id: string;
  title: string;
  status: string;
  currency: string;
  versions: Array<{ totalMinor: number }>;
}

export function FinanceList({ canManage }: { canManage: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["estimates"],
    queryFn: async (): Promise<{ items: EstimateRow[] }> => {
      const res = await fetch("/api/v1/estimates");
      if (!res.ok) throw new Error("Could not load estimates.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Estimates" description="Create, send, accept and convert quotes while preserving historical pricing." />
      {canManage && <FinanceDocumentForm kind="estimates" />}
      {isPending && <p role="status">Loading estimates?</p>}
      {isError && <p role="alert">Could not load estimates.</p>}
      {data?.items.length === 0 && <p className="text-muted-foreground">No estimates yet.</p>}
      <div className="grid gap-3">
        {(data?.items ?? []).map((estimate) => (
          <Card key={estimate.id}>
            <CardHeader>
              <CardTitle>{estimate.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {estimate.status.replaceAll("_", " ")} • {money(estimate.versions[0]?.totalMinor ?? 0, estimate.currency)}
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {estimate.status === "DRAFT" && <FinanceAction endpoint={`/api/v1/estimates/${estimate.id}`} method="PATCH" label="Share with client" queryKey="estimates" payload={{ status: "SENT" }} />}
                  {estimate.status === "SENT" && <FinanceAction endpoint={`/api/v1/estimates/${estimate.id}/accept`} label="Accept and create draft invoice" queryKey="estimates" payload={{}} />}
                  <FinanceAction endpoint={`/api/v1/estimates/${estimate.id}/duplicate`} label="Duplicate" queryKey="estimates" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
