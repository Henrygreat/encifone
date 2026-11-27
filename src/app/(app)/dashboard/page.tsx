import Link from "next/link";
import { requireActiveMembership } from "@/core/tenancy";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor } from "@/lib/money";
import { getDashboardSummary } from "@/modules/dashboard/service";
import { getActionCentreItems, type ActionCentreSeverity } from "@/modules/intelligence/action-centre";
import { getSalesVelocityMetrics } from "@/modules/sales/analytics";
import { getAIConfig } from "@/modules/ai/service";
import { isAIConfigured } from "@/lib/ai-gateway";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BentoCard, BentoEmptyState, BentoGrid } from "@/components/bento/bento-grid";
import { MetricCard } from "@/components/ui/metric-card";
import { AttentionCard } from "@/components/ui/attention-card";
import { AIInsightCard } from "@/components/ui/ai-insight-card";
import { DashboardHero, HeroQuickAction } from "@/components/dashboard/dashboard-hero";
import { LeadSourceChart } from "@/components/dashboard/lead-source-chart";
import { PipelineStageChart } from "@/components/dashboard/pipeline-stage-chart";
import { formatEnumLabel } from "@/lib/utils";
import { UserPlus, Target, KanbanSquare, Users, Building2, PiggyBank, TrendingUp, Award } from "lucide-react";

const PLANNED_WIDGETS: { title: string; availableFrom: string }[] = [
  { title: "Monthly recurring revenue", availableFrom: "Phase 4" },
  { title: "Client health scores", availableFrom: "Phase 10" },
  { title: "AI executive briefing", availableFrom: "Phase 9" },
];

export default async function DashboardPage() {
  const acting = await requireActiveMembership();

  const [session, organisation, memberCount, summary, actionCentreItems, velocity, aiConfig, aiEnabled] =
    await Promise.all([
      getServerAuthSession(),
      prisma.organisation.findUniqueOrThrow({ where: { id: acting.organisationId } }),
      prisma.membership.count({ where: { organisationId: acting.organisationId, status: "ACTIVE" } }),
      getDashboardSummary(acting),
      getActionCentreItems(acting),
      getSalesVelocityMetrics(acting),
      getAIConfig(acting),
      isAIConfigured(acting.organisationId),
    ]);

  const stageDurationsWithDeals = velocity.stageDurations.filter((s) => s.segmentCount > 0);
  const maxStageDays = Math.max(1, ...stageDurationsWithDeals.map((s) => s.avgDays ?? 0));

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const SEVERITY_ORDER: Record<ActionCentreSeverity, number> = { urgent: 0, warning: 1, info: 2 };
  const sortedActionItems = [...actionCentreItems].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const urgentCount = sortedActionItems.filter((i) => i.severity === "urgent").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <BentoGrid>
        <DashboardHero
          firstName={firstName}
          organisationName={organisation.name}
          summaryLine={`${memberCount} active member${memberCount === 1 ? "" : "s"} · ${organisation.defaultCurrency} · building since ${organisation.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short" })}`}
          aiActive={aiEnabled}
          aiStatusLabel={aiEnabled ? `Active — ${aiConfig.provider ?? "configured"}` : "Not yet configured"}
          quickActions={
            <>
              <HeroQuickAction href="/contacts" icon={UserPlus} primary>
                New contact
              </HeroQuickAction>
              <HeroQuickAction href="/leads" icon={Target}>
                New lead
              </HeroQuickAction>
              <HeroQuickAction href="/deals" icon={KanbanSquare}>
                New deal
              </HeroQuickAction>
            </>
          }
        />

        {/* Real business KPIs */}
        <MetricCard
          label="Pipeline value"
          value={formatMoneyMinor(summary.pipelineValueMinor, "GBP")}
          icon={PiggyBank}
          accentModule="sales"
          tooltip="Sum of valueMinor across every open opportunity."
        />
        <MetricCard
          label="Weighted forecast"
          value={formatMoneyMinor(summary.weightedForecastMinor, "GBP")}
          icon={TrendingUp}
          accentModule="sales"
          tooltip="Each open deal's value × its probability (own override, or its stage's default)."
        />
        <MetricCard
          label="Lead conversion"
          value={summary.conversionRate === null ? "—" : `${Math.round(summary.conversionRate * 100)}%`}
          icon={Award}
          accentModule="crm"
          tooltip="Converted leads ÷ total non-archived leads."
        />
        <MetricCard label="Contacts" value={summary.totalContacts} icon={Users} accentModule="crm" href="/contacts" />

        <MetricCard label="Companies" value={summary.totalCompanies} icon={Building2} accentModule="crm" href="/companies" />
        <MetricCard label="Active leads" value={summary.activeLeads} icon={Target} accentModule="crm" href="/leads" />
        <MetricCard label="Open deals" value={summary.openOpportunities} icon={KanbanSquare} accentModule="sales" href="/deals" />
        <MetricCard label="Won deals" value={summary.wonOpportunities} icon={Award} accentModule="sales" />

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
            {urgentCount > 0 && <Badge variant="destructive">{urgentCount} urgent</Badge>}
          </div>
          {sortedActionItems.length === 0 ? (
            <BentoEmptyState title="Nothing urgent" description="You're on top of your pipeline and follow-ups." />
          ) : (
            <ul className="flex flex-col gap-1.5 overflow-y-auto">
              {sortedActionItems.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <AttentionCard item={item} />
                </li>
              ))}
              {sortedActionItems.length > 8 && (
                <li className="pt-1 text-xs text-muted-foreground">+{sortedActionItems.length - 8} more</li>
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

        {/* Sales velocity — real aggregates from OpportunityStageHistory and
            each deal's own createdAt/wonAt/lostAt (src/modules/sales/analytics.ts),
            never a fabricated figure. */}
        <BentoCard colSpan={12} accentModule="sales">
          <span className="text-sm font-medium text-foreground">Sales velocity &amp; stage duration</span>
          {velocity.salesCycle.wonCount === 0 &&
          velocity.salesCycle.lostCount === 0 &&
          stageDurationsWithDeals.length === 0 ? (
            <BentoEmptyState
              title="No stage history yet"
              description="Move a deal through your pipeline to start seeing average time-in-stage and sales-cycle length here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Average time spent per stage</p>
                {stageDurationsWithDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed stage segments yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {stageDurationsWithDeals.map((stage) => (
                      <li key={stage.stageId} className="flex items-center gap-3 text-sm">
                        <span className="w-28 shrink-0 truncate text-foreground">{stage.stageName}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, ((stage.avgDays ?? 0) / maxStageDays) * 100)}%`,
                              background: "var(--module-sales)",
                            }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-muted-foreground">
                          {stage.avgDays ?? 0}d
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">Sales cycle</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg. days to close (won)</span>
                  <span className="text-foreground">
                    {velocity.salesCycle.avgDaysToWon === null ? "—" : `${velocity.salesCycle.avgDaysToWon}d`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg. days to lose</span>
                  <span className="text-foreground">
                    {velocity.salesCycle.avgDaysToLost === null ? "—" : `${velocity.salesCycle.avgDaysToLost}d`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Stalled deals</span>
                  <span className="text-foreground">
                    {velocity.stalled.count > 0 ? (
                      <Badge variant="destructive">{velocity.stalled.count}</Badge>
                    ) : (
                      "0"
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </BentoCard>

        {/* AI insights — real configuration state, never a fabricated
            summary or implied activity when AI isn't enabled. */}
        <BentoCard colSpan={12} accentModule="intelligence">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">AI insights</span>
            <Badge variant={aiEnabled ? "default" : "outline"}>{aiEnabled ? "Enabled" : "Not yet configured"}</Badge>
          </div>
          <AIInsightCard configured={aiEnabled} provider={aiConfig.provider} />
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
