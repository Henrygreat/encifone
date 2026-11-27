import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { createOpportunity, ensureDefaultPipeline, moveOpportunity } from "@/modules/sales/service";
import { getSalesVelocityMetrics } from "@/modules/sales/analytics";
import { membershipIdFor } from "../helpers/membership";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

let owner: { userId: string; organisationId: string };
let acting: ActiveMembership;

beforeAll(async () => {
  owner = await registerOwner({
    name: "Velocity Org Owner",
    email: uniqueEmail("velocity-owner"),
    password: "password123",
    organisationName: `Velocity Org ${randomUUID()}`,
  });
  createdOrgIds.push(owner.organisationId);
  createdUserIds.push(owner.userId);
  acting = {
    userId: owner.userId,
    organisationId: owner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(owner.userId, owner.organisationId),
  };
});

afterAll(async () => {
  await prisma.opportunityStageHistory.deleteMany({ where: { opportunity: { organisationId: { in: createdOrgIds } } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Sales velocity metrics", () => {
  it("computes average stage duration and sales-cycle duration from real timestamps, not fabricated figures", async () => {
    const pipeline = await ensureDefaultPipeline(acting);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const qualifiedStage = pipeline.stages.find((s) => s.name === "Qualified")!;
    const wonStage = pipeline.stages.find((s) => s.isWon)!;

    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: `Velocity Deal ${randomUUID()}`,
    });

    // Backdate creation to 20 days ago — the deal spent 20 days in "New"
    // before its first move (the service itself only ever sets createdAt
    // to the real time at creation; backdating here simulates the passage
    // of time for a deterministic, non-flaky assertion).
    await prisma.opportunity.update({ where: { id: deal.id }, data: { createdAt: daysAgo(20) } });

    await moveOpportunity(acting, deal.id, { stageId: qualifiedStage.id, orderedIds: [deal.id] });
    // Backdate that move to 10 days ago — the deal spent 10 days in "New"
    // (20 -> 10 days ago) and has been in "Qualified" for 10 days since.
    await prisma.opportunityStageHistory.updateMany({
      where: { opportunityId: deal.id, toStageId: qualifiedStage.id },
      data: { changedAt: daysAgo(10) },
    });

    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const metrics = await getSalesVelocityMetrics(acting, pipeline.id);

    const newStageMetric = metrics.stageDurations.find((s) => s.stageId === newStage.id)!;
    expect(newStageMetric.segmentCount).toBe(1);
    expect(newStageMetric.avgDays).toBeGreaterThanOrEqual(9.9);
    expect(newStageMetric.avgDays).toBeLessThanOrEqual(10.1);

    const qualifiedStageMetric = metrics.stageDurations.find((s) => s.stageId === qualifiedStage.id)!;
    expect(qualifiedStageMetric.segmentCount).toBe(1);
    expect(qualifiedStageMetric.avgDays).toBeGreaterThanOrEqual(9.9);
    expect(qualifiedStageMetric.avgDays).toBeLessThanOrEqual(10.1);

    expect(metrics.salesCycle.wonCount).toBe(1);
    expect(metrics.salesCycle.avgDaysToWon).toBeGreaterThanOrEqual(19.9);
    expect(metrics.salesCycle.avgDaysToWon).toBeLessThanOrEqual(20.1);
    expect(metrics.salesCycle.lostCount).toBe(0);
    expect(metrics.salesCycle.avgDaysToLost).toBeNull();
  });

  it("flags a deal with no logged activity, stuck past the cutoff, as stalled", async () => {
    const pipeline = await ensureDefaultPipeline(acting);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;

    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: `Stalled Deal ${randomUUID()}`,
    });
    await prisma.opportunity.update({ where: { id: deal.id }, data: { createdAt: daysAgo(30), updatedAt: daysAgo(30) } });

    const metrics = await getSalesVelocityMetrics(acting, pipeline.id);
    expect(metrics.stalled.count).toBeGreaterThanOrEqual(1);
    expect(metrics.stalled.avgDaysInStage).toBeGreaterThan(14);
  });

  it("returns an honest empty result for an organisation with no deals", async () => {
    const emptyOrgOwner = await registerOwner({
      name: "Empty Velocity Org Owner",
      email: uniqueEmail("empty-velocity-owner"),
      password: "password123",
      organisationName: `Empty Velocity Org ${randomUUID()}`,
    });
    createdOrgIds.push(emptyOrgOwner.organisationId);
    createdUserIds.push(emptyOrgOwner.userId);
    const emptyActing: ActiveMembership = {
      userId: emptyOrgOwner.userId,
      organisationId: emptyOrgOwner.organisationId,
      role: "ORGANISATION_OWNER",
      membershipId: await membershipIdFor(emptyOrgOwner.userId, emptyOrgOwner.organisationId),
    };

    const metrics = await getSalesVelocityMetrics(emptyActing);
    expect(metrics.salesCycle.avgDaysToWon).toBeNull();
    expect(metrics.salesCycle.avgDaysToLost).toBeNull();
    expect(metrics.stalled.count).toBe(0);
  });
});
