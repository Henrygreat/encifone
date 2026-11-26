import Link from "next/link";
import { requireActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor } from "@/lib/money";
import { getDashboardSummary } from "@/modules/dashboard/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BentoCard, BentoEmptyState, BentoGrid } from "@/components/bento/bento-grid";
import { LeadSourceChart } from "@/components/dashboard/lead-source-chart";
import { formatEnumLabel } from "@/lib/utils";

const PLANNED_WIDGETS: { title: string; availableFrom: string }[] = [
  { title: "Monthly recurring revenue", availableFrom: "Phase 4" },
  { title: "Client health scores", availableFrom: "Phase 10" },
  { title: "AI executive briefing", availableFrom: "Phase 9" },
];

function Kpi({
  label,
  value,
  accentModule,
  href,
}: {
  label: string;
  value: string | number;
  accentModule?: "overview" | "crm" | "sales" | "work" | "intelligence" | "admin";
  href?: string;
}) {
  const content = (
    <BentoCard accentModule={accentModule}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight text-foreground">{value}</span>
    </BentoCard>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default async function DashboardPage() {
  const acting = await requireActiveMembership();

  const [organisation, memberCount, summary] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: acting.organisationId } }),
    prisma.membership.count({ where: { organisationId: acting.organisationId, status: "ACTIVE" } }),
    getDashboardSummary(acting),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{organisation.name}</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as <span className="font-medium">{acting.role.replaceAll("_", " ")}</span>.
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
              {organisation.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{organisation.slug}</CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          CRM &amp; sales
        </h2>
        <BentoGrid>
          <Kpi label="Contacts" value={summary.totalContacts} accentModule="crm" href="/contacts" />
          <Kpi label="Companies" value={summary.totalCompanies} accentModule="crm" href="/companies" />
          <Kpi label="Active leads" value={summary.activeLeads} accentModule="crm" href="/leads" />
          <Kpi label="Open deals" value={summary.openOpportunities} accentModule="sales" href="/deals" />

          <Kpi label="Pipeline value" value={formatMoneyMinor(summary.pipelineValueMinor, "GBP")} accentModule="sales" />
          <Kpi
            label="Weighted forecast"
            value={formatMoneyMinor(summary.weightedForecastMinor, "GBP")}
            accentModule="sales"
          />
          <Kpi label="Won deals" value={summary.wonOpportunities} accentModule="sales" />
          <Kpi
            label="Lead conversion rate"
            value={summary.conversionRate === null ? "—" : `${Math.round(summary.conversionRate * 100)}%`}
            accentModule="crm"
          />

          <BentoCard colSpan={2} rowSpan={2} accentModule="crm">
            <span className="text-sm font-medium text-foreground">Lead source performance</span>
            {summary.leadsBySource.length === 0 ? (
              <BentoEmptyState
                title="No lead sources recorded yet"
                description="Capture a lead with a source (e.g. Website form, Referral) to see this chart fill in."
              />
            ) : (
              <LeadSourceChart data={summary.leadsBySource} />
            )}
          </BentoCard>

          <BentoCard colSpan={2} rowSpan={2} accentModule="overview">
            <span className="text-sm font-medium text-foreground">Recent activity</span>
            {summary.recentActivities.length === 0 ? (
              <BentoEmptyState
                title="Nothing logged yet"
                description="Calls, meetings, notes, and tasks you log against contacts, companies, leads, or deals will show up here."
              />
            ) : (
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {summary.recentActivities.map((activity) => (
                  <li key={activity.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{activity.subject}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatEnumLabel(activity.type)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>

          <BentoCard colSpan={2} accentModule="work">
            <span className="text-sm font-medium text-foreground">Upcoming follow-ups</span>
            {summary.upcomingFollowUps.length === 0 ? (
              <BentoEmptyState title="Nothing due soon" description="Open tasks with a due date will appear here." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {summary.upcomingFollowUps.map((task) => (
                  <li key={task.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{task.subject}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {task.dueAt?.toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>

          <BentoCard colSpan={2} accentModule="work">
            <span className="text-sm font-medium text-foreground">Overdue tasks</span>
            {summary.overdueTasksCount === 0 ? (
              <BentoEmptyState title="Nothing overdue" description="You're on top of your open tasks." />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-3xl font-semibold text-destructive">{summary.overdueTasksCount}</span>
                <span className="text-sm text-muted-foreground">
                  task{summary.overdueTasksCount === 1 ? "" : "s"} past due
                </span>
              </div>
            )}
          </BentoCard>

          <BentoCard colSpan={4} accentModule="intelligence">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">AI insights</span>
              <Badge variant="outline">Not yet configured</Badge>
            </div>
            <BentoEmptyState
              title="No AI provider configured"
              description="Contact summaries, lead prioritisation, and next-best-action suggestions will appear here once an AI provider is connected (Phase 2.8/5) — never fabricated figures in the meantime."
            />
          </BentoCard>
        </BentoGrid>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANNED_WIDGETS.map((widget) => (
          <Card key={widget.title} className="border-dashed">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{widget.title}</CardDescription>
                <Badge variant="outline">{widget.availableFrom}</Badge>
              </div>
              <CardTitle className="text-base font-normal text-muted-foreground">Not available yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This widget will show real, drill-down-capable figures once that phase ships — see
              docs/MASTER_ROADMAP.md.
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/contacts">View contacts</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/leads">View leads</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/deals">View pipeline</Link>
        </Button>
      </div>
    </div>
  );
}
