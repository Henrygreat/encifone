"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { name: string } | null;
}

export default function TasksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async (): Promise<{ items: TaskRow[] }> => {
      const res = await fetch("/api/v1/tasks?pageSize=50");
      if (!res.ok) throw new Error("Could not load tasks.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Tasks" description="Manage tasks, assignees and due dates." />
      {isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <div className="grid gap-3">
          {(data?.items ?? []).map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <CardTitle>{task.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {task.status.replaceAll("_", " ")} • {task.priority} • Project: {task.project?.name ?? "None"}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
