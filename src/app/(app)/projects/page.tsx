"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  progressPercent: number;
  dueDate: string | null;
  client: { name: string } | null;
}

export default function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<{ items: ProjectRow[] }> => {
      const res = await fetch("/api/v1/projects?pageSize=50");
      if (!res.ok) throw new Error("Could not load projects.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Projects" description="Track project delivery, milestones and progress." />
      {isLoading ? (
        <div className="grid gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid gap-3">
          {(data?.items ?? []).map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {project.status.replaceAll("_", " ")} • {project.priority} • {project.progressPercent}% • Client: {project.client?.name ?? "N/A"}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
