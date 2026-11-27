"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkflowRow {
  id: string;
  name: string;
  triggerEvent: string;
  status: string;
  version: number;
}

export default function WorkflowsPage() {
  const { data } = useQuery({
    queryKey: ["workflows"],
    queryFn: async (): Promise<{ items: WorkflowRow[] }> => {
      const res = await fetch("/api/v1/workflows?pageSize=50");
      if (!res.ok) throw new Error("Could not load workflows.");
      return res.json();
    },
  });

  const { data: executions } = useQuery({
    queryKey: ["workflow-executions"],
    queryFn: async (): Promise<{ executions: Array<{ id: string; status: string; createdAt: string }> }> => {
      const res = await fetch("/api/v1/workflows/executions");
      if (!res.ok) throw new Error("Could not load workflow executions.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Workflows" description="Configure event-driven automation with auditable execution history." />
      <div className="grid gap-3">
        {(data?.items ?? []).map((flow) => (
          <Card key={flow.id}>
            <CardHeader>
              <CardTitle>{flow.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Trigger: {flow.triggerEvent} • Status: {flow.status} • Version {flow.version}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent executions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {(executions?.executions ?? []).slice(0, 10).map((exec) => (
            <div key={exec.id}>
              {exec.status} • {new Date(exec.createdAt).toLocaleString()}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
