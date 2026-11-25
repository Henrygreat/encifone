import { requireActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANNED_WIDGETS: { title: string; availableFrom: string }[] = [
  { title: "Monthly recurring revenue", availableFrom: "Phase 4" },
  { title: "Sales pipeline value", availableFrom: "Phase 2" },
  { title: "Client health scores", availableFrom: "Phase 10" },
  { title: "AI executive briefing", availableFrom: "Phase 9" },
];

export default async function DashboardPage() {
  const { organisationId, role } = await requireActiveMembership();

  const [organisation, memberCount] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    prisma.membership.count({ where: { organisationId, status: "ACTIVE" } }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {organisation.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <span className="font-medium">{role.replaceAll("_", " ")}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Active members</CardDescription>
            <CardTitle className="text-3xl">{memberCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Manage who has access under Organisation Settings.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Default currency</CardDescription>
            <CardTitle className="text-3xl">{organisation.defaultCurrency}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Used across invoicing and reporting once Finance ships.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Organisation since</CardDescription>
            <CardTitle className="text-3xl">
              {organisation.createdAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{organisation.slug}</CardContent>
        </Card>

        {PLANNED_WIDGETS.map((widget) => (
          <Card key={widget.title} className="border-dashed">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{widget.title}</CardDescription>
                <Badge variant="outline">{widget.availableFrom}</Badge>
              </div>
              <CardTitle className="text-base font-normal text-muted-foreground">
                Not available yet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This widget will show real, drill-down-capable figures once that phase ships — see
              docs/MASTER_ROADMAP.md.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
