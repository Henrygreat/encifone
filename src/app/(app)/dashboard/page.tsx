import { formatFinanceMoney } from "@/lib/finance-money";
import { Capability, roleHasCapability } from "@/core/permissions";
import { getFinancialMetrics } from "@/modules/finance/service";
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
  const finance = roleHasCapability(acting.role, Capability.FINANCE_VIEW) ? await getFinancialMetrics(acting) : null;

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
          highlights={[
            { label: "Organisation", value: organisation.name },
            {
              label: "Workspace age",
              value: organisation.createdAt.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
            },
            { label: "Currency", value: organisation.defaultCurrency },
            { label: "Team members", value: `${memberCount}` },
          ]}
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

        {/* Row 2 */}
        <MetricCard
          key="pipeline-value"
          label="Pipeline value"
          value={formatMoneyMinor(summary.pipelineValueMinor, "GBP")}
          icon={PiggyBank}
          accentModule="sales"
          colSpan={4}
          tooltip="Sum of valueMinor across every open opportunity."
        >
          <span className="sr-only" data-testid="kpi-pipeline-value" />
        </MetricCard>
        <MetricCard
          key="weighted-forecast"
          label="Weighted forecast"
          value={formatMoneyMinor(summary.weightedForecastMinor, "GBP")}
          icon={TrendingUp}
          accentModule="sales"
          colSpan={4}
          tooltip="Each open deal value multiplied by its probability."
        >
          <span className="sr-only" data-testid="kpi-weighted-forecast" />
        </MetricCard>
        <MetricCard
          key="lead-conversion"
          label="Lead conversion"
          value={summary.conversionRate === null ? "-" : `${Math.round(summary.conversionRate * 100)}%`}
          icon={Award}
          accentModule="crm"
          colSpan={4}
          tooltip="Converted leads divided by total non-archived leads."
        >
          <span className="sr-only" data-testid="kpi-lead-conversion" />
        </MetricCard>

        {/* Row 3 */}
        <BentoCard colSpan={6} accentModule="crm" className="min-h-[280px]" data-testid="operational-kpis-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Operational KPIs</span>
            <Badge variant="outline">Live counts</Badge>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-rows-2">
            <Link
              href="/contacts"
              className="rounded-lg border border-border/70 bg-muted/35 p-3 transition-colors hover:bg-muted/55"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">Contacts</span>
                <Users className="size-4 shrink-0 text-[var(--module-crm)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground tabular-nums">{summary.totalContacts}</p>
            </Link>
            <Link
              href="/companies"
              className="rounded-lg border border-border/70 bg-muted/35 p-3 transition-colors hover:bg-muted/55"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">Companies</span>
                <Building2 className="size-4 shrink-0 text-[var(--module-crm)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground tabular-nums">{summary.totalCompanies}</p>
            </Link>
            <Link
              href="/leads"
              className="rounded-lg border border-border/70 bg-muted/35 p-3 transition-colors hover:bg-muted/55"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">Active leads</span>
                <Target className="size-4 shrink-0 text-[var(--module-crm)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground tabular-nums">{summary.activeLeads}</p>
            </Link>
            <Link
              href="/deals"
              className="rounded-lg border border-border/70 bg-muted/35 p-3 transition-colors hover:bg-muted/55"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">Open deals</span>
                <KanbanSquare className="size-4 shrink-0 text-[var(--module-sales)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold leading-none text-foreground tabular-nums">{summary.openOpportunities}</p>
            </Link>
          </div>
        </BentoCard>

        <BentoCard colSpan={6} accentModule="sales" className="min-h-[280px]" data-testid="sales-performance-card">
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

        {/* Row 4 */}
        <BentoCard colSpan={6} accentModule="crm" className="min-h-[260px]" data-testid="lead-source-card">
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

        <BentoCard colSpan={6} accentModule="work" className="min-h-[260px]" data-testid="attention-card">
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

        {/* Row 5 */}
        <BentoCard colSpan={7} accentModule="overview" className="min-h-[230px]" data-testid="recent-activity-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Recent activity</span>
            <Clock3 className="size-4 text-muted-foreground" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {summary.recentActivities.length === 0 ? (
              <BentoEmptyState
                title="No recent activity"
                description="Logged calls, tasks, and notes will appear here."
              />
            ) : (
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {summary.recentActivities.slice(0, 8).map((activity) => (
                  <li
                    key={activity.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-foreground">{activity.subject}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatEnumLabel(activity.type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </BentoCard>

        <BentoCard colSpan={5} accentModule="overview" className="min-h-[230px]" data-testid="quick-actions-card">
          <span className="text-sm font-medium text-foreground">Quick actions</span>
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
        </BentoCard>

        {/* Row 6 */}
        <BentoCard colSpan={12} accentModule="sales" className="min-h-[230px]" data-testid="sales-velocity-card">
          <span className="text-sm font-medium text-foreground">Sales velocity</span>
          {velocity.salesCycle.wonCount === 0 &&
          velocity.salesCycle.lostCount === 0 &&
          stageDurationsWithDeals.length === 0 ? (
            <BentoEmptyState
              title="No stage history yet"
              description="Move deals through stages to reveal cycle-time and stage-duration metrics."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
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

        {/* Row 7 */}
        {aiEnabled ? (
          <BentoCard colSpan={12} accentModule="intelligence" className="min-h-[170px]" data-testid="ai-insights-card">
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
          <BentoCard colSpan={12} accentModule="intelligence" className="py-4" data-testid="ai-insights-card">
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
        {finance && (
          <BentoCard colSpan={12} accentModule="sales">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Monthly recurring revenue ({finance.currency})</p>
                <p className="text-2xl font-semibold tabular-nums">{formatFinanceMoney(finance.mrrMinor, finance.currency)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link href="/subscriptions">Subscriptions</Link></Button>
                <Button asChild variant="outline"><Link href="/invoices">Invoices</Link></Button>
                <Button asChild variant="outline"><Link href="/estimates">Estimates</Link></Button>
                <Button asChild variant="outline"><Link href="/expenses">Expenses</Link></Button>
                <Button asChild variant="outline"><Link href="/retainers">Retainers</Link></Button>
                <Button asChild variant="outline"><Link href="/forecasting">Forecast</Link></Button>
                <Button asChild variant="outline"><Link href="/profitability">Financial reporting</Link></Button>
              </div>
            </div>
          </BentoCard>
        )}
      </BentoGrid>
    </div>
  );
}
