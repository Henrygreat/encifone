import { requireActivePortalSession } from "@/modules/portal/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalHelpdeskPage() {
  const session = await requireActivePortalSession();
  const tickets = await prisma.helpdeskTicket.findMany({
    where: { organisationId: session.organisationId, clientId: session.clientId },
    include: { comments: { where: { isInternal: false }, orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Helpdesk</h1>
      {tickets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No support tickets</CardTitle>
            <CardDescription>Open a ticket from the portal API when you need support.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        tickets.map((ticket) => (
          <Card key={ticket.id}>
            <CardHeader>
              <CardTitle>{ticket.reference}</CardTitle>
              <CardDescription>
                {ticket.subject} • {ticket.status.replaceAll("_", " ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
              {ticket.comments.map((comment) => (
                <p key={comment.id} className="text-sm">{comment.body}</p>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
