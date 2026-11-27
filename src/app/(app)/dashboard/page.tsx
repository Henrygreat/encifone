import Link from "next/link";
import { requireActiveMembership } from "@/core/tenancy";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor } from "@/lib/money";
import { getDashboardSummary } from "@/modules/dashboard/service";
import { getActionCentreItems, type ActionCentreSeverity } from "@/modules/intelligence/action-centre";
import { getSalesVelocityMetrics } from "@/modules/sales/analytics";
import { getAIConfig, getAIOperationalState } from "@/modules/ai/service";
import { isAIConfigured } from "@/lib/ai-gateway";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BentoCard, BentoEmptyState, BentoGrid } from "@/components/bento/bento-grid";
import { MetricCard } from "@/components/ui/metric-card";
import { AttentionCard } from "@/components/ui/attention-card";
import { AIInsightCard } from "@/components/ui/ai-insight-card";
import { DashboardHero, HeroQuickAction } from "@/components/dashboard/dashboard-hero";
import { LeadSourceChart } from "@/components/dashboard/lead-source-chart";
import { PipelineStageChart } from "@/components/dashboard/pipeline-stage-chart";
import { formatEnumLabel } from "@/lib/utils";
import {
  UserPlus,
  Target,
  KanbanSquare,
  Users,
  Building2,
  PiggyBank,
  TrendingUp,
  Award,
  Clock3,
  ShieldCheck,
} from "lucide-react";

function resolveDisplayName(fullName: string | null | undefined, organisationName: string) {
  if (!fullName?.trim()) return organisationName;

  const honorifics = new Set([
    "mr",
    "mrs",
    "ms",
    "miss",
    "dr",
    "prof",
    "sir",
    "madam",
    "lord",
    "lady",
  ]);

  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/\./g, ""));

  const preferred = parts.find((part) => part.length > 1 && !honorifics.has(part.toLowerCase()));
  return preferred ?? organisationName;
}

export default async function DashboardPage() {
  const acting = await requireActiveMembership();

  const [session, organisation, memberCount, summary, actionCentreItems, velocity, aiConfig, aiEnabled, aiStatus] =
    await Promise.all([
      getServerAuthSession(),
      prisma.organisation.findUniqueOrThrow({ where: { id: acting.organisationId } }),
      prisma.membership.count({ where: { organisationId: acting.organisationId, status: "ACTIVE" } }),
      getDashboardSummary(acting),
      getActionCentreItems(acting),
      getSalesVelocityMetrics(acting),
      getAIConfig(acting),
      isAIConfigured(acting.organisationId),
      getAIOperationalState(acting),
    ]);

  const stageDurationsWithDeals = velocity.stageDurations.filter((s) => s.segmentCount > 0);
  const maxStageDays = Math.max(1, ...stageDurationsWithDeals.map((s) => s.avgDays ?? 0));

  const firstName = resolveDisplayName(session?.user?.name, organisation.name);
  const SEVERITY_ORDER: Record<ActionCentreSeverity, number> = { urgent: 0, warning: 1, info: 2 };
  const sortedActionItems = [...actionCentreItems].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const urgentCount = sortedActionItems.filter((i) => i.severity === "urgent").length;

  return (
    <div className="mx-auto flex w-full max-w-[1760px] min-w-0 flex-col gap-5 px-4 py-4 sm:px-5 lg:px-6 xl:px-7">
      <BentoGrid className="auto-rows-[minmax(120px,auto)]">
        {/* Row 1 */}
        <DashboardHero
          firstName={firstName}
          organisationName={organisation.name}
          summaryLine={`${memberCount} active member${memberCount === 1 ? "" : "s"} · ${organisation.defaultCurrency} workspace`}
          aiState={aiStatus.state}
          aiStatusLabel={aiStatus.label}
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

        <BentoCard colSpan={4} accentModule="overview" className="min-h-[210px] gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Business overview</span>
            <ShieldCheck className="size-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm min-[460px]:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Organisation</p>
              <p className="mt-1 truncate font-medium text-foreground">{organisation.name}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Workspace age</p>
              <p className="mt-1 font-medium text-foreground">
                {organisation.createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="mt-1 font-medium text-foreground">{organisation.defaultCurrency}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Team members</p>
              <p className="mt-1 font-medium text-foreground">{memberCount}</p>
            </div>
          </div>
        </BentoCard>

        {/* Row 2 */}
        <MetricCard
          key="pipeline-value"
          label="Pipeline value"
          value={formatMoneyMinor(summary.pipelineValueMinor, "GBP")}
          icon={PiggyBank}
          accentModule="sales"
          colSpan={4}
          tooltip="Sum of valueMinor across every open opportunity."
        />
        <MetricCard
          key="weighted-forecast"
          label="Weighted forecast"
          value={formatMoneyMinor(summary.weightedForecastMinor, "GBP")}
          icon={TrendingUp}
          accentModule="sales"
          colSpan={4}
          tooltip="Each open deal value multiplied by its probability."
        />
        <MetricCard
          key="lead-conversion"
          label="Lead conversion"
          value={summary.conversionRate === null ? "-" : `${Math.round(summary.conversionRate * 100)}%`}
          icon={Award}
          accentModule="crm"
          colSpan={4}
          tooltip="Converted leads divided by total non-archived leads."
        />

        {/* Row 3 */}
        <MetricCard
          key="contacts"
          label="Contacts"
          value={summary.totalContacts}
          icon={Users}
          accentModule="crm"
          href="/contacts"
          colSpan={3}
        />
        <MetricCard
          key="companies"
          label="Companies"
          value={summary.totalCompanies}
          icon={Building2}
          accentModule="crm"
          href="/companies"
          colSpan={3}
        />
        <MetricCard
          key="active-leads"
          label="Active leads"
          value={summary.activeLeads}
          icon={Target}
          accentModule="crm"
          href="/leads"
          colSpan={3}
        />
        <MetricCard
          key="open-deals"
          label="Open deals"
          value={summary.openOpportunities}
          icon={KanbanSquare}
          accentModule="sales"
          href="/deals"
          colSpan={3}
        />

        {/* Row 4 */}
        <BentoCard colSpan={6} accentModule="sales">
          <span className="text-sm font-medium text-foreground">Sales performance</span>
          {summary.pipelineByStage.length === 0 ? (
            <BentoEmptyState
              title="No open deals yet"
              description="Add a deal to your pipeline to see value distribution across stages."
            />
          ) : (
            <PipelineStageChart data={summary.pipelineByStage} />
          )}
        </BentoCard>

        <BentoCard colSpan={6} accentModule="crm">
          <span className="text-sm font-medium text-foreground">Lead source analytics</span>
          {summary.leadsBySource.length === 0 ? (
            <BentoEmptyState
              title="No lead sources recorded"
              description="Capture leads with source details to unlock this chart."
            />
          ) : (
            <LeadSourceChart data={summary.leadsBySource} />
          )}
        </BentoCard>

        {/* Row 5 */}
        <BentoCard colSpan={6} accentModule="work">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Needs your attention</span>
            {urgentCount > 0 && <Badge variant="destructive">{urgentCount} urgent</Badge>}
          </div>
          {sortedActionItems.length === 0 ? (
            <BentoEmptyState title="Nothing urgent" description="Pipeline and follow-ups are up to date." />
          ) : (
            <ul className="flex flex-col gap-1.5 overflow-y-auto">
              {sortedActionItems.slice(0, 7).map((item) => (
                <li key={item.id}>
                  <AttentionCard item={item} />
                </li>
              ))}
              {sortedActionItems.length > 7 && (
                <li className="pt-1 text-xs text-muted-foreground">+{sortedActionItems.length - 7} more</li>
              )}
            </ul>
          )}
        </BentoCard>

        <BentoCard colSpan={6} accentModule="overview">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Recent activity and quick actions</span>
            <Clock3 className="size-4 text-muted-foreground" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-2">
              {summary.recentActivities.length === 0 ? (
                <BentoEmptyState
                  title="No recent activity"
                  description="Logged calls, tasks, and notes will appear here."
                />
              ) : (
                <ul className="flex flex-col gap-2 overflow-y-auto">
                  {summary.recentActivities.slice(0, 6).map((activity) => (
                    <li key={activity.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{activity.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatEnumLabel(activity.type)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid content-start gap-2">
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
                  <KanbanSquare className="size-4" /> Open pipeline
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/members">
                  <ShieldCheck className="size-4" /> Organisation settings
                </Link>
              </Button>
            </div>
          </div>
        </BentoCard>

        {/* Row 6 */}
        <BentoCard colSpan={12} accentModule="sales">
          <span className="text-sm font-medium text-foreground">Sales velocity</span>
          {velocity.salesCycle.wonCount === 0 &&
          velocity.salesCycle.lostCount === 0 &&
          stageDurationsWithDeals.length === 0 ? (
            <BentoEmptyState
              title="No stage history yet"
              description="Move deals through stages to reveal cycle-time and stage-duration metrics."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Average time per stage</p>
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
                    {velocity.salesCycle.avgDaysToWon === null ? "-" : `${velocity.salesCycle.avgDaysToWon}d`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg. days to lose</span>
                  <span className="text-foreground">
                    {velocity.salesCycle.avgDaysToLost === null ? "-" : `${velocity.salesCycle.avgDaysToLost}d`}
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

        {aiEnabled ? (
          <BentoCard colSpan={12} accentModule="intelligence">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">AI insights</span>
              <Badge variant="default">Enabled</Badge>
            </div>
            <AIInsightCard
              configured={aiEnabled}
              provider={aiConfig.provider}
              state={aiStatus.state}
              stateLabel={aiStatus.label}
            />
          </BentoCard>
        ) : (
          <BentoCard colSpan={12} accentModule="intelligence" className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Activate AI insights</p>
                <p className="text-sm text-muted-foreground">
                  Connect your preferred provider to unlock lead qualification, deal risk, and client summaries.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/members">Configure AI</Link>
              </Button>
            </div>
          </BentoCard>
        )}
      </BentoGrid>
    </div>
  );
}
