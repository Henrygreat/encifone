import { prisma } from "@/lib/prisma";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { STALLED_DAYS } from "@/modules/intelligence/action-centre";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface StageDurationMetric {
  stageId: string;
  stageName: string;
  position: number;
  avgDays: number | null;
  segmentCount: number;
}

export interface SalesVelocityMetrics {
  stageDurations: StageDurationMetric[];
  salesCycle: {
    avgDaysToWon: number | null;
    avgDaysToLost: number | null;
    wonCount: number;
    lostCount: number;
  };
  stalled: {
    count: number;
    avgDaysInStage: number | null;
  };
}

/**
 * Real, tenant-scoped aggregates computed from `OpportunityStageHistory` and
 * each opportunity's own `createdAt`/`wonAt`/`lostAt` — never a fabricated
 * or hardcoded figure (CLAUDE.md rule 4). An org with no closed-won/closed-
 * lost deals yet, or no stage moves yet, legitimately returns nulls/empty
 * arrays rather than invented numbers; the caller renders that as an honest
 * empty state.
 */
export async function getSalesVelocityMetrics(
  acting: ActiveMembership,
  pipelineId?: string
): Promise<SalesVelocityMetrics> {
  requireCapability(acting, Capability.CRM_VIEW);

  const organisationId = acting.organisationId;

  const [stages, opportunities] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { pipeline: { organisationId, ...(pipelineId ? { id: pipelineId } : {}) } },
      orderBy: { position: "asc" },
    }),
    prisma.opportunity.findMany({
      where: { organisationId, deletedAt: null, ...(pipelineId ? { pipelineId } : {}) },
      include: {
        stageHistory: { orderBy: { changedAt: "asc" } },
        _count: { select: { activities: true } },
      },
    }),
  ]);

  const now = new Date();
  const stalledCutoff = new Date(now.getTime() - STALLED_DAYS * MS_PER_DAY);

  // Every segment of time a deal spent in a given stage, across every deal.
  const segmentsByStage = new Map<string, number[]>();
  const daysToWon: number[] = [];
  const daysToLost: number[] = [];
  let stalledCount = 0;
  const stalledDurationsDays: number[] = [];

  for (const opp of opportunities) {
    const closedAt = opp.wonAt ?? opp.lostAt ?? null;

    // Reconstruct the full stage timeline: creation is the entry point into
    // whichever stage the opportunity was first in (the first history row's
    // fromStageId, if any history exists — createOpportunity itself writes
    // no history row for the initial placement).
    const timeline: { stageId: string | null; enteredAt: Date }[] = [];
    const firstStageId = opp.stageHistory[0]?.fromStageId ?? opp.stageId;
    timeline.push({ stageId: firstStageId, enteredAt: opp.createdAt });
    for (const h of opp.stageHistory) {
      timeline.push({ stageId: h.toStageId, enteredAt: h.changedAt });
    }

    for (let i = 0; i < timeline.length; i++) {
      const segment = timeline[i];
      if (!segment.stageId) continue;
      const segmentEnd = i + 1 < timeline.length ? timeline[i + 1].enteredAt : closedAt ?? now;
      const durationDays = (segmentEnd.getTime() - segment.enteredAt.getTime()) / MS_PER_DAY;
      if (durationDays < 0) continue;

      const isCurrentSegment = i === timeline.length - 1;
      segmentsByStage.set(segment.stageId, [...(segmentsByStage.get(segment.stageId) ?? []), durationDays]);

      // "Stalled" mirrors the Action Centre's own definition exactly: open,
      // no activity logged, and this (current) stage entered before the cutoff.
      if (
        isCurrentSegment &&
        opp.status === "OPEN" &&
        opp._count.activities === 0 &&
        segment.enteredAt < stalledCutoff
      ) {
        stalledCount++;
        stalledDurationsDays.push(durationDays);
      }
    }

    if (opp.wonAt) {
      daysToWon.push((opp.wonAt.getTime() - opp.createdAt.getTime()) / MS_PER_DAY);
    }
    if (opp.lostAt) {
      daysToLost.push((opp.lostAt.getTime() - opp.createdAt.getTime()) / MS_PER_DAY);
    }
  }

  function average(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  const stageDurations: StageDurationMetric[] = stages.map((stage) => {
    const durations = segmentsByStage.get(stage.id) ?? [];
    return {
      stageId: stage.id,
      stageName: stage.name,
      position: stage.position,
      avgDays: average(durations),
      segmentCount: durations.length,
    };
  });

  return {
    stageDurations,
    salesCycle: {
      avgDaysToWon: average(daysToWon),
      avgDaysToLost: average(daysToLost),
      wonCount: daysToWon.length,
      lostCount: daysToLost.length,
    },
    stalled: {
      count: stalledCount,
      avgDaysInStage: average(stalledDurationsDays),
    },
  };
}
