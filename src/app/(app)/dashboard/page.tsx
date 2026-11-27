import Link from "next/link";
import { requireActiveMembership } from "@/core/tenancy";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor } from "@/lib/money";
import { getDashboardSummary } from "@/modules/dashboard/service";
import { getActionCentreItems, type ActionCentreSeverity } from "@/modules/intelligence/action-centre";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BentoCard, BentoEmptyState, BentoGrid } from "@/components/bento/bento-grid";
import { LeadSourceChart } from "@/components/dashboard/lead-source-chart";
import { PipelineStageChart } from "@/components/dashboard/pipeline-stage-chart";
import { AiOrb } from "@/components/three/ai-orb";
import { formatEnumLabel } from "@/lib/utils";
import { UserPlus, Target, KanbanSquare } from "lucide-react";

const PLANNED_WIDGETS: { title: string; availableFrom: string }[] = [
  { title: "Monthly recurring revenue", availableFrom: "Phase 4" },
  { title: "Client health scores", availableFrom: "Phase 10" },
  { title: "AI executive briefing", availableFrom: "Phase 9" },
];

type ModuleKey = "overview" | "crm" | "sales" | "work" | "intelligence" | "admin";

function Kpi({
  label,
  value,
  accentModule,
  href,
}: {
  label: string;
  value: string | number;
  accentModule?: ModuleKey;
  href?: string;
}) {
  const content = (
    <BentoCard colSpan={3} accentModule={accentModule}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight text-foreground">{value}</span>
    </BentoCard>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function greeting(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const acting = await requireActiveMembership();

  const [session, organisation, memberCount, summary, actionCentreItems] = await Promise.all([
    getServerAuthSession(),
    prisma.organisation.findUniqueOrThrow({ where: { id: acting.organisationId } }),
    prisma.membership.count({ where: { organisationId: acting.organisationId, status: "ACTIVE" } }),
    getDashboardSummary(acting),
    getActionCentreItems(acting),
  ]);

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const SEVERITY_ORDER: Record<ActionCentreSeverity, number> = { urgent: 0, warning: 1, info: 2 };
  const sortedActionItems = [...actionCentreItems].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const SEVERITY_BADGE_VARIANT: Record<ActionCentreSeverity, "destructive" | "secondary" | "outline"> = {
    urgent: "destructive",
    warning: "secondary",
    info: "outline",
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <BentoGrid>
        {/* Personalised welcome hero */}
        <BentoCard colSpan={8} rowSpan={2} variant="glass" className="justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium" style={{ color: "var(--module-sales)" }}>
              {greeting(new Date().getHours())}, {firstName}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {organisation.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {memberCount} active member{memberCount === 1 ? "" : "s"} · {organisation.defaultCurrency} ·
              building since{" "}
              {organisation.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short" })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" style={{ background: "var(--module-crm)", color: "#060B14" }}>
              <Link href="/contacts">
                <UserPlus className="size-4" /> New contact
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/leads">
                <Target className="size-4" /> New lead
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/deals">
                <KanbanSquare className="size-4" /> New deal
              </Link>
            </Button>
          </div>
        </BentoCard>

        {/* Compact AI intelligence visualisation — the one WebGL canvas on
            this page, per docs/DESIGN_SYSTEM.md §9. */}
        <BentoCard colSpan={4} rowSpan={2} accentModule="intelligence" className="items-center justify-center text-center">
          <AiOrb className="size-24" />
          <p className="text-sm font-medium text-foreground">AI Intelligence Core</p>
          <p className="text-xs text-muted-foreground">Not yet configured — see below</p>
        </BentoCard>

        {/* Real business KPIs */}
        <Kpi label="Pipeline value" value={formatMoneyMinor(summary.pipelineValueMinor, "GBP")} accentModule="sales" />
        <Kpi
          label="Weighted forecast"
          value={formatMoneyMinor(summary.weightedForecastMinor, "GBP")}
          accentModule="sales"
        />
        <Kpi
          label="Lead conversion"
          value={summary.conversionRate === null ? "—" : `${Math.round(summary.conversionRate * 100)}%`}
          accentModule="crm"
        />
        <Kpi label="Contacts" value={summary.totalContacts} accentModule="crm" href="/contacts" />

        <Kpi label="Companies" value={summary.totalCompanies} accentModule="crm" href="/companies" />
        <Kpi label="Active leads" value={summary.activeLeads} accentModule="crm" href="/leads" />
        <Kpi label="Open deals" value={summary.openOpportunities} accentModule="sales" href="/deals" />
        <Kpi label="Won deals" value={summary.wonOpportunities} accentModule="sales" />

        {/* Sales performance */}
        <BentoCard colSpan={6} rowSpan={2} accentModule="sales">
          <span className="text-sm font-medium text-foreground">Sales performance by stage</span>
          {summary.pipelineByStage.length === 0 ? (
            <BentoEmptyState
              title="No open deals yet"
              description="Add a deal to your pipeline to see how value is distributed across stages."
            />
          ) : (
            <PipelineStageChart data={summary.pipelineByStage} />
          )}
        </BentoCard>

        {/* Lead source analytics */}
        <BentoCard colSpan={6} rowSpan={2} accentModule="crm">
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

        {/* Recent activity */}
        <BentoCard colSpan={4} rowSpan={2} accentModule="overview">
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
                  <span className="shrink-0 text-xs text-muted-foreground">{formatEnumLabel(activity.type)}</span>
                </li>
              ))}
            </ul>
          )}
        </BentoCard>

        {/* Needs your attention — real, tenant-scoped signals, never
            fabricated urgency (src/modules/intelligence/action-centre.ts) */}
        <BentoCard colSpan={4} rowSpan={2} accentModule="work">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Needs your attention</span>
            {sortedActionItems.filter((i) => i.severity === "urgent").length > 0 && (
              <Badge variant="destructive">
                {sortedActionItems.filter((i) => i.severity === "urgent").length} urgent
              </Badge>
            )}
          </div>
          {sortedActionItems.length === 0 ? (
            <BentoEmptyState title="Nothing urgent" description="You're on top of your pipeline and follow-ups." />
          ) : (
            <ul className="flex flex-col gap-1.5 overflow-y-auto">
              {sortedActionItems.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted"
                  >
                    <span className="flex flex-col truncate">
                      <span className="truncate text-foreground">{item.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <Badge variant={SEVERITY_BADGE_VARIANT[item.severity]} className="shrink-0">
                      {item.severity}
                    </Badge>
                  </Link>
                </li>
              ))}
              {sortedActionItems.length > 8 && (
                <li className="pt-1 text-xs text-muted-foreground">
                  +{sortedActionItems.length - 8} more
                </li>
              )}
            </ul>
          )}
        </BentoCard>

        {/* Quick-create actions */}
        <BentoCard colSpan={4} rowSpan={2} accentModule="admin">
          <span className="text-sm font-medium text-foreground">Quick actions</span>
          <div className="flex flex-1 flex-col gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/contacts">
                <UserPlus className="size-4" /> Add a contact
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/leads">
                <Target className="size-4" /> Capture a lead
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/deals">
                <KanbanSquare className="size-4" /> Open the pipeline
              </Link>
            </Button>
          </div>
        </BentoCard>

        {/* AI insights — where configured */}
        <BentoCard colSpan={12} accentModule="intelligence">
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
    </div>
  );
}
