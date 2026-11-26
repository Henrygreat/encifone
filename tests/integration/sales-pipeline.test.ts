import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import {
  createOpportunity,
  ensureDefaultPipeline,
  getOpportunity,
  listOpportunities,
  moveOpportunity,
} from "@/modules/sales/service";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

let orgAOwner: { userId: string; organisationId: string };
let orgBOwner: { userId: string; organisationId: string };
let actingAsOrgAOwner: ActiveMembership;
let actingAsOrgBOwner: ActiveMembership;

beforeAll(async () => {
  orgAOwner = await registerOwner({
    name: "Sales Org A Owner",
    email: uniqueEmail("sales-owner-a"),
    password: "password123",
    organisationName: `Sales Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Sales Org B Owner",
    email: uniqueEmail("sales-owner-b"),
    password: "password123",
    organisationName: `Sales Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
  };
});

afterAll(async () => {
  await prisma.opportunityStageHistory.deleteMany({
    where: { opportunity: { organisationId: { in: createdOrgIds } } },
  });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Pipeline bootstrap", () => {
  it("creates a default pipeline with won/lost stages on first access, idempotently", async () => {
    const first = await ensureDefaultPipeline(actingAsOrgAOwner);
    expect(first.stages.length).toBeGreaterThan(0);
    expect(first.stages.some((s) => s.isWon)).toBe(true);
    expect(first.stages.some((s) => s.isLost)).toBe(true);

    const second = await ensureDefaultPipeline(actingAsOrgAOwner);
    expect(second.id).toBe(first.id); // not recreated on a second call
  });
});

describe("Opportunity tenant isolation", () => {
  it("never returns another organisation's opportunities", async () => {
    const pipelineA = await ensureDefaultPipeline(actingAsOrgAOwner);
    const pipelineB = await ensureDefaultPipeline(actingAsOrgBOwner);
    const firstStageA = pipelineA.stages[0];
    const firstStageB = pipelineB.stages[0];

    const dealA = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipelineA.id,
      stageId: firstStageA.id,
      name: "Deal A",
    });
    await createOpportunity(actingAsOrgBOwner, {
      pipelineId: pipelineB.id,
      stageId: firstStageB.id,
      name: "Deal B",
    });

    const orgAList = await listOpportunities(actingAsOrgAOwner, {
      page: 1,
      pageSize: 100,
      sortBy: "position",
      sortDir: "asc",
    });
    expect(orgAList.items.some((o) => o.name === "Deal A")).toBe(true);
    expect(orgAList.items.some((o) => o.name === "Deal B")).toBe(false);

    await expect(getOpportunity(actingAsOrgBOwner, dealA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects creating an opportunity against another organisation's pipeline/stage", async () => {
    const pipelineB = await ensureDefaultPipeline(actingAsOrgBOwner);

    await expect(
      createOpportunity(actingAsOrgAOwner, {
        pipelineId: pipelineB.id,
        stageId: pipelineB.stages[0].id,
        name: "Should fail",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Opportunity stage move", () => {
  it("writes stage history and sets WON fields only when moved into an isWon stage", async () => {
    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const wonStage = pipeline.stages.find((s) => s.isWon)!;

    const deal = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: `Move me ${randomUUID()}`,
      valueMinor: 500000,
    });
    expect(deal.status).toBe("OPEN");

    const moved = await moveOpportunity(actingAsOrgAOwner, deal.id, {
      stageId: wonStage.id,
      orderedIds: [deal.id],
      wonReason: "Great fit",
    });

    expect(moved.stageId).toBe(wonStage.id);
    expect(moved.status).toBe("WON");
    expect(moved.wonAt).not.toBeNull();
    expect(moved.wonReason).toBe("Great fit");
    expect(moved.lostAt).toBeNull();

    const history = await prisma.opportunityStageHistory.findMany({ where: { opportunityId: deal.id } });
    expect(history.length).toBe(1);
    expect(history[0].fromStageId).toBe(newStage.id);
    expect(history[0].toStageId).toBe(wonStage.id);
  });

  it("reopens a deal (clears won/lost fields) when dragged back to a normal stage", async () => {
    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const lostStage = pipeline.stages.find((s) => s.isLost)!;

    const deal = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: `Reopen me ${randomUUID()}`,
    });

    await moveOpportunity(actingAsOrgAOwner, deal.id, {
      stageId: lostStage.id,
      orderedIds: [deal.id],
      lostReason: "Budget",
    });
    const reopened = await moveOpportunity(actingAsOrgAOwner, deal.id, {
      stageId: newStage.id,
      orderedIds: [deal.id],
    });

    expect(reopened.status).toBe("OPEN");
    expect(reopened.lostAt).toBeNull();
    expect(reopened.lostReason).toBeNull();
  });

  it("does not write a stage-history row for a same-stage reorder, and reindexes siblings too", async () => {
    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    const stage = pipeline.stages.find((s) => s.name === "Qualified")!;

    const dealOne = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: stage.id,
      name: `Reorder A ${randomUUID()}`,
    });
    const dealTwo = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: stage.id,
      name: `Reorder B ${randomUUID()}`,
    });
    expect(dealOne.position).toBeLessThan(dealTwo.position);

    const before = await prisma.opportunityStageHistory.count({ where: { opportunityId: dealOne.id } });
    // Swap order: dealTwo now first, dealOne second.
    await moveOpportunity(actingAsOrgAOwner, dealOne.id, {
      stageId: stage.id,
      orderedIds: [dealTwo.id, dealOne.id],
    });
    const after = await prisma.opportunityStageHistory.count({ where: { opportunityId: dealOne.id } });
    expect(after).toBe(before);

    const refreshedOne = await prisma.opportunity.findUniqueOrThrow({ where: { id: dealOne.id } });
    const refreshedTwo = await prisma.opportunity.findUniqueOrThrow({ where: { id: dealTwo.id } });
    expect(refreshedOne.position).toBe(1);
    expect(refreshedTwo.position).toBe(0);
  });
});
