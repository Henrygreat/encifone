"use client";

import { formatFinanceMoney as money } from "@/lib/finance-money";

import { FinanceAction } from "@/components/finance/document-actions";
import { FinanceFields } from "@/components/finance/finance-fields";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SubscriptionRow {
  id: string;
  title: string;
  status: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
}

export function FinanceList({ canManage }: { canManage: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async (): Promise<{ items: SubscriptionRow[] }> => {
      const res = await fetch("/api/v1/subscriptions");
      if (!res.ok) throw new Error("Could not load subscriptions.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Subscriptions" description="Manage recurring billing lifecycle, renewals, and upgrades." />
      {canManage && <FinanceFields label="New subscription" endpoint="/api/v1/subscriptions" queryKey="subscriptions" fields={[{ name: "title", label: "Title" }, { name: "clientId", label: "Client ID", optional: true }, { name: "amountMinor", label: "Amount (minor units)", type: "number" }, { name: "currency", label: "Currency", optional: true }, { name: "billingInterval", label: "Billing interval", options: ["MONTHLY", "QUARTERLY", "ANNUAL"] }, { name: "intervalCount", label: "Intervals per cycle", type: "number", min: 1, initial: 1 }, { name: "startDate", label: "Start date", type: "date" }, { name: "nextBillingDate", label: "Next billing date", type: "date", optional: true }]} />}
      {isPending && <p role="status">Loading subscriptions?</p>}
      {isError && <p role="alert">Could not load subscriptions.</p>}
      {data?.items.length === 0 && <p className="text-muted-foreground">No subscriptions yet.</p>}
      <div className="grid gap-3">
        {(data?.items ?? []).map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {item.status} • {item.billingInterval} • {money(item.amountMinor, item.currency)}
              {canManage && <div className="mt-3 flex flex-wrap gap-2">
                 {["ACTIVE", "TRIALING"].includes(item.status) && <FinanceAction endpoint={`/api/v1/subscriptions/${item.id}/transition`} label="Pause" queryKey="subscriptions" payload={{ action: "PAUSE" }} />}
                 {item.status === "PAUSED" && <FinanceAction endpoint={`/api/v1/subscriptions/${item.id}/transition`} label="Resume" queryKey="subscriptions" payload={{ action: "RESUME" }} />}
                 {["ACTIVE", "TRIALING", "PAUSED"].includes(item.status) && <FinanceAction endpoint={`/api/v1/subscriptions/${item.id}/transition`} label="Cancel subscription" queryKey="subscriptions" payload={{ action: "CANCEL" }} />}
               </div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
