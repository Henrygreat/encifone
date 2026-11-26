import { prisma } from "@/lib/prisma";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";

/**
 * Every figure here is a real, tenant-scoped aggregate query — never a
 * hardcoded or fabricated number (CLAUDE.md rule 4). A widget with nothing
 * to show yet (e.g. no leads logged) gets an honest empty/zero state in the
 * UI, not a placeholder figure.
 */
export async function getDashboardSummary(acting: ActiveMembership) {
  if (!roleHasCapability(acting.role, Capability.CRM_VIEW)) {
    throw new ForbiddenError("You do not have permission to view this dashboard.");
  }

  const organisationId = acting.organisationId;
  const now = new Date();

  const [
    totalContacts,
    totalCompanies,
    activeLeads,
    totalLeadsEverCreated,
    convertedLeads,
    openOpportunities,
    wonOpportunities,
    openValueAgg,
    weightedOpenOpportunities,
    recentActivities,
    overdueTasksCount,
    upcomingFollowUps,
    leadsBySource,
  ] = await Promise.all([
    prisma.contact.count({ where: { organisationId, deletedAt: null } }),
    prisma.company.count({ where: { organisationId, deletedAt: null } }),
    prisma.lead.count({
      where: { organisationId, deletedAt: null, status: { notIn: ["CONVERTED", "LOST", "ARCHIVED"] } },
    }),
    prisma.lead.count({ where: { organisationId } }),
    prisma.lead.count({ where: { organisationId, status: "CONVERTED" } }),
    prisma.opportunity.count({ where: { organisationId, deletedAt: null, status: "OPEN" } }),
    prisma.opportunity.count({ where: { organisationId, deletedAt: null, status: "WON" } }),
    prisma.opportunity.aggregate({
      where: { organisationId, deletedAt: null, status: "OPEN" },
      _sum: { valueMinor: true },
    }),
    prisma.opportunity.findMany({
      where: { organisationId, deletedAt: null, status: "OPEN", valueMinor: { not: null } },
      select: { valueMinor: true, probability: true, stage: { select: { probability: true } } },
    }),
    prisma.activity.findMany({
      where: { organisationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { owner: { include: { user: true } } },
    }),
    prisma.activity.count({ where: { organisationId, status: "OPEN", dueAt: { lt: now } } }),
    prisma.activity.findMany({
      where: { organisationId, status: "OPEN", dueAt: { gte: now } },
      orderBy: { dueAt: "asc" },
      take: 5,
      include: { owner: { include: { user: true } } },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: { organisationId, source: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Weighted forecast: each open opportunity's value times its own
  // probability override, or its stage's default probability if unset —
  // the same fallback rule the opportunity's own probability field uses
  // (see src/modules/sales/service.ts's createOpportunity).
  const weightedForecastMinor = weightedOpenOpportunities.reduce((sum, o) => {
    const probability = o.probability ?? o.stage.probability;
    return sum + Math.round((o.valueMinor ?? 0) * (probability / 100));
  }, 0);

  return {
    totalContacts,
    totalCompanies,
    activeLeads,
    openOpportunities,
    wonOpportunities,
    pipelineValueMinor: openValueAgg._sum.valueMinor ?? 0,
    weightedForecastMinor,
    conversionRate: totalLeadsEverCreated > 0 ? convertedLeads / totalLeadsEverCreated : null,
    recentActivities,
    overdueTasksCount,
    upcomingFollowUps,
    leadsBySource: leadsBySource
      .map((row) => ({ source: row.source ?? "Unknown", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
