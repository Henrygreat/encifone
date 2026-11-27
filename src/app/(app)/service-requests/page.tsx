"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  id: string;
  title: string;
  status: string;
  priority: string;
  client: { name: string };
}

export default function ServiceRequestsPage() {
  const { data } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async (): Promise<{ items: Row[] }> => {
      const res = await fetch("/api/v1/service-requests?pageSize=50");
      if (!res.ok) throw new Error("Could not load service requests.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Service Requests" description="Track requests, approvals, ownership and SLA progress." />
      <div className="grid gap-3">
        {(data?.items ?? []).map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {item.status.replaceAll("_", " ")} • {item.priority} • {item.client?.name ?? "Unknown client"}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
