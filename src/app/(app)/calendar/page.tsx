"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TaskRow {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
}

export default function CalendarPage() {
  const { data } = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async (): Promise<{ items: TaskRow[] }> => {
      const res = await fetch("/api/v1/tasks?pageSize=100");
      if (!res.ok) throw new Error("Could not load calendar tasks.");
      return res.json();
    },
  });

  const dueItems = (data?.items ?? []).filter((task) => task.dueDate);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Calendar" description="Upcoming scheduled work from task due dates." />
      <div className="grid gap-3">
        {dueItems.map((task) => (
          <Card key={task.id}>
            <CardHeader>
              <CardTitle>{task.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "N/A"} • {task.status.replaceAll("_", " ")}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
