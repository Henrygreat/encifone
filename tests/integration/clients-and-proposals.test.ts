import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import { createOpportunity, ensureDefaultPipeline, moveOpportunity } from "@/modules/sales/service";
import { getClient, listClients } from "@/modules/clients/service";
import { createServiceItem, updateServiceItemPrice } from "@/modules/catalogue/service";
import {
  createProposal,
  ensurePublicLink,
  getProposalByPublicToken,
  respondToPublicProposal,
  updateProposalStatus,
} from "@/modules/proposals/service";
import { membershipIdFor } from "../helpers/membership";

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
    name: "Client Org A Owner",
    email: uniqueEmail("client-owner-a"),
    password: "password123",
    organisationName: `Client Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Client Org B Owner",
    email: uniqueEmail("client-owner-b"),
    password: "password123",
    organisationName: `Client Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgAOwner.userId, orgAOwner.organisationId),
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgBOwner.userId, orgBOwner.organisationId),
  };
});

afterAll(async () => {
  await prisma.proposalLine.deleteMany({ where: { proposalVersion: { proposal: { organisationId: { in: createdOrgIds } } } } });
  await prisma.proposalVersion.deleteMany({ where: { proposal: { organisationId: { in: createdOrgIds } } } });
  await prisma.proposal.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.serviceItemPriceHistory.deleteMany({ where: { serviceItem: { organisationId: { in: createdOrgIds } } } });
  await prisma.serviceItem.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.clientLifecycleHistory.deleteMany({ where: { client: { organisationId: { in: createdOrgIds } } } });
  await prisma.client.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Client auto-creation from a won deal", () => {
  it("creates exactly one Client when an opportunity enters a Won stage, idempotently", async () => {
    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const wonStage = pipeline.stages.find((s) => s.isWon)!;

    const deal = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: newStage.id,
      name: `Won Deal ${randomUUID()}`,
    });

    await moveOpportunity(actingAsOrgAOwner, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const clients = await listClients(actingAsOrgAOwner, { page: 1, pageSize: 25, sortBy: "createdAt", sortDir: "desc" });
    const created = clients.items.filter((c) => c.originatingOpportunityId === deal.id);
    expect(created.length).toBe(1);
    expect(created[0].lifecycleStage).toBe("WON");

    // Moving it out and back into Won must not create a second Client.
    await moveOpportunity(actingAsOrgAOwner, deal.id, { stageId: newStage.id, orderedIds: [deal.id] });
    await moveOpportunity(actingAsOrgAOwner, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const clientsAfter = await listClients(actingAsOrgAOwner, { page: 1, pageSize: 25, sortBy: "createdAt", sortDir: "desc" });
    expect(clientsAfter.items.filter((c) => c.originatingOpportunityId === deal.id).length).toBe(1);
  });
});

describe("Client tenant isolation", () => {
  it("never returns another organisation's client", async () => {
    const pipelineB = await ensureDefaultPipeline(actingAsOrgBOwner);
    const wonStageB = pipelineB.stages.find((s) => s.isWon)!;
    const dealB = await createOpportunity(actingAsOrgBOwner, {
      pipelineId: pipelineB.id,
      stageId: pipelineB.stages[0].id,
      name: `Org B Deal ${randomUUID()}`,
    });
    await moveOpportunity(actingAsOrgBOwner, dealB.id, { stageId: wonStageB.id, orderedIds: [dealB.id] });

    const orgBClients = await listClients(actingAsOrgBOwner, { page: 1, pageSize: 25, sortBy: "createdAt", sortDir: "desc" });
    const clientB = orgBClients.items.find((c) => c.originatingOpportunityId === dealB.id)!;

    await expect(getClient(actingAsOrgAOwner, clientB.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Service catalogue price history", () => {
  it("snapshots every price change rather than overwriting it", async () => {
    const item = await createServiceItem(actingAsOrgAOwner, { name: `Consulting ${randomUUID()}`, unitPriceMinor: 50000 });
    await updateServiceItemPrice(actingAsOrgAOwner, item.id, { unitPriceMinor: 60000 });

    const history = await prisma.serviceItemPriceHistory.findMany({ where: { serviceItemId: item.id }, orderBy: { effectiveFrom: "asc" } });
    expect(history.length).toBe(2);
    expect(history[0].unitPriceMinor).toBe(50000);
    expect(history[1].unitPriceMinor).toBe(60000);
  });
});

describe("Proposal public-link flow", () => {
  it("marks VIEWED on first open and returns the updated state, not a stale snapshot", async () => {
    const proposal = await createProposal(actingAsOrgAOwner, {
      title: `Proposal ${randomUUID()}`,
      lines: [{ description: "Day rate", unitPriceMinor: 75000, quantity: 3 }],
    });
    await updateProposalStatus(actingAsOrgAOwner, proposal.id, { status: "SENT" });
    const withLink = await ensurePublicLink(actingAsOrgAOwner, proposal.id);

    const firstView = await getProposalByPublicToken(withLink.publicToken!);
    expect(firstView.status).toBe("VIEWED");
    expect(firstView.viewedAt).not.toBeNull();

    const dbState = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(dbState.status).toBe("VIEWED");
  });

  it("rejects a second response once the client has already answered", async () => {
    const proposal = await createProposal(actingAsOrgAOwner, { title: `Respond Twice ${randomUUID()}` });
    await updateProposalStatus(actingAsOrgAOwner, proposal.id, { status: "SENT" });
    const withLink = await ensurePublicLink(actingAsOrgAOwner, proposal.id);

    const accepted = await respondToPublicProposal(withLink.publicToken!, "ACCEPTED");
    expect(accepted.status).toBe("ACCEPTED");

    await expect(respondToPublicProposal(withLink.publicToken!, "DECLINED")).rejects.toThrow(
      "already been responded to"
    );
  });

  it("rejects an unknown or tampered public token", async () => {
    await expect(getProposalByPublicToken("not-a-real-token")).rejects.toBeInstanceOf(NotFoundError);
  });
});
