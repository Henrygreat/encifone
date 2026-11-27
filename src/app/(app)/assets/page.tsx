"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AssetRow {
  id: string;
  name: string;
  reference: string;
  type: string;
  status: string;
}

export default function AssetsPage() {
  const { data } = useQuery({
    queryKey: ["assets"],
    queryFn: async (): Promise<{ items: AssetRow[] }> => {
      const res = await fetch("/api/v1/assets?pageSize=50");
      if (!res.ok) throw new Error("Could not load assets.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Assets" description="Track physical and digital assets, ownership and renewal timelines." />
      <div className="grid gap-3">
        {(data?.items ?? []).map((asset) => (
          <Card key={asset.id}>
            <CardHeader>
              <CardTitle>{asset.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {asset.reference} • {asset.type} • {asset.status}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
