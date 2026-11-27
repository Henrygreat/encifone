"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MemberRow {
  id: string;
  role: string;
  user: { name: string | null; email: string };
  membershipProfile: { classification: string; skills: string[]; weeklyCapacityHours: number } | null;
}

export default function TeamPage() {
  const { data } = useQuery({
    queryKey: ["workforce-directory"],
    queryFn: async (): Promise<{ members: MemberRow[] }> => {
      const res = await fetch("/api/v1/workforce/directory");
      if (!res.ok) throw new Error("Could not load team directory.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Team" description="Directory of staff and contractors with skills and capacity profiles." />
      <div className="grid gap-3">
        {(data?.members ?? []).map((member) => (
          <Card key={member.id}>
            <CardHeader>
              <CardTitle>{member.user.name ?? member.user.email}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {member.role} • {member.membershipProfile?.classification ?? "Not profiled"}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
