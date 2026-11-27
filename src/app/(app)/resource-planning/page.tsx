"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Analytics {
  workforce: {
    billableMinutes: number;
    nonBillableMinutes: number;
    pendingTimesheets: number;
    approvedTimesheets: number;
  };
}

function toHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

export default function ResourcePlanningPage() {
  const { data } = useQuery({
    queryKey: ["operations-analytics"],
    queryFn: async (): Promise<Analytics> => {
      const res = await fetch("/api/v1/analytics/operations");
      if (!res.ok) throw new Error("Could not load analytics.");
      return res.json();
    },
  });

  const workforce = data?.workforce;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Resource Planning" description="Review team capacity, utilisation and approval workload." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Billable hours</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{toHours(workforce?.billableMinutes ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Non-billable hours</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{toHours(workforce?.nonBillableMinutes ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Pending timesheets</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{workforce?.pendingTimesheets ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Approved timesheets</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{workforce?.approvedTimesheets ?? 0}</CardContent>
        </Card>
      </div>
    </div>
  );
}
