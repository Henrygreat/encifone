import { requireActivePortalSession } from "@/modules/portal/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalServiceRequestsPage() {
  const session = await requireActivePortalSession();
  const requests = await prisma.serviceRequest.findMany({
    where: { organisationId: session.organisationId, clientId: session.clientId },
    include: { comments: { where: { isInternal: false }, orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Service requests</h1>
      {requests.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No requests yet</CardTitle>
            <CardDescription>Use support to raise your first request if needed.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{request.title}</CardTitle>
              <CardDescription>
                {request.status.replaceAll("_", " ")} • {request.priority}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {request.description && <p className="text-sm text-muted-foreground">{request.description}</p>}
              {request.comments.map((comment) => (
                <p key={comment.id} className="text-sm">{comment.body}</p>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
