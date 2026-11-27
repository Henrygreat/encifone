"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MyWorkSummary {
  assigned: number;
  dueToday: number;
  upcoming: number;
  overdue: number;
  blocked: number;
  awaitingApproval: number;
}

export default function MyWorkPage() {
  const { data } = useQuery({
    queryKey: ["my-work"],
    queryFn: async (): Promise<MyWorkSummary> => {
      const res = await fetch("/api/v1/my-work");
      if (!res.ok) throw new Error("Could not load your work summary.");
      return res.json();
    },
  });

  const items = [
    { label: "Assigned", value: data?.assigned ?? 0 },
    { label: "Due today", value: data?.dueToday ?? 0 },
    { label: "Upcoming", value: data?.upcoming ?? 0 },
    { label: "Overdue", value: data?.overdue ?? 0 },
    { label: "Blocked", value: data?.blocked ?? 0 },
    { label: "Awaiting approval", value: data?.awaitingApproval ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="My Work" description="A personal workspace for your active task commitments." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{item.value}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
