"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ArticleRow {
  id: string;
  title: string;
  status: string;
  isClientVisible: boolean;
  updatedAt: string;
}

export default function KnowledgeBasePage() {
  const { data } = useQuery({
    queryKey: ["knowledge-articles"],
    queryFn: async (): Promise<{ items: ArticleRow[] }> => {
      const res = await fetch("/api/v1/knowledge/articles?pageSize=50");
      if (!res.ok) throw new Error("Could not load knowledge articles.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Knowledge Base" description="Publish internal and client-facing guidance with version history." />
      <div className="grid gap-3">
        {(data?.items ?? []).map((article) => (
          <Card key={article.id}>
            <CardHeader>
              <CardTitle>{article.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {article.status} • {article.isClientVisible ? "Client visible" : "Internal only"} • Updated {new Date(article.updatedAt).toLocaleDateString()}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
