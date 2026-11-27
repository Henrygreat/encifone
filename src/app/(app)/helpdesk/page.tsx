"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TicketRow {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
}

export default function HelpdeskPage() {
  const { data } = useQuery({
    queryKey: ["tickets"],
    queryFn: async (): Promise<{ items: TicketRow[] }> => {
      const res = await fetch("/api/v1/helpdesk/tickets?pageSize=50");
      if (!res.ok) throw new Error("Could not load tickets.");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Helpdesk" description="Manage support queues, ticket SLAs and client replies." />
      <div className="grid gap-3">
        {(data?.items ?? []).map((ticket) => (
          <Card key={ticket.id}>
            <CardHeader>
              <CardTitle>{ticket.reference}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {ticket.subject} • {ticket.status.replaceAll("_", " ")} • {ticket.priority}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
