import { requireActivePortalSession } from "@/modules/portal/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalAssetsPage() {
  const session = await requireActivePortalSession();
  const assets = await prisma.asset.findMany({
    where: { organisationId: session.organisationId, clientId: session.clientId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
      {assets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assets assigned</CardTitle>
            <CardDescription>Assets linked to your account will be listed here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        assets.map((asset) => (
          <Card key={asset.id}>
            <CardHeader>
              <CardTitle>{asset.name}</CardTitle>
              <CardDescription>
                {asset.reference} • {asset.status}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Type: {asset.type}</p>
              {asset.location && <p className="text-sm text-muted-foreground">Location: {asset.location}</p>}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
