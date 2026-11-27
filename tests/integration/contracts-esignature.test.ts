import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import {
  createContract,
  createContractTemplate,
  declineContractPublicly,
  getContract,
  getContractByPublicToken,
  hasSignedContractForOpportunity,
  InvalidWebhookSignatureError,
  processESignatureWebhook,
  sendContractForSignature,
  signContractPublicly,
} from "@/modules/contracts/service";
import { MockESignatureProvider } from "@/modules/contracts/esignature-provider";
import { createOpportunity, ensureDefaultPipeline } from "@/modules/sales/service";

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
    name: "Contracts Org A Owner",
    email: uniqueEmail("contracts-owner-a"),
    password: "password123",
    organisationName: `Contracts Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Contracts Org B Owner",
    email: uniqueEmail("contracts-owner-b"),
    password: "password123",
    organisationName: `Contracts Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = { userId: orgAOwner.userId, organisationId: orgAOwner.organisationId, role: "ORGANISATION_OWNER" };
  actingAsOrgBOwner = { userId: orgBOwner.userId, organisationId: orgBOwner.organisationId, role: "ORGANISATION_OWNER" };
});

afterAll(async () => {
  await prisma.incomingWebhookEvent.deleteMany({});
  await prisma.signatureRequest.deleteMany({ where: { contract: { organisationId: { in: createdOrgIds } } } });
  await prisma.contractVersion.deleteMany({ where: { contract: { organisationId: { in: createdOrgIds } } } });
  await prisma.contract.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.contractTemplate.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Contract templates and tenant isolation", () => {
  it("creates a contract from a template's body and never leaks it across tenants", async () => {
    const template = await createContractTemplate(actingAsOrgAOwner, {
      name: `MSA Template ${randomUUID()}`,
      bodyMarkdown: "This agreement is between {{client}} and us.",
    });

    const contract = await createContract(actingAsOrgAOwner, {
      title: `Contract from template ${randomUUID()}`,
      templateId: template.id,
    });

    const fetched = await getContract(actingAsOrgAOwner, contract.id);
    expect(fetched.versions[0].content).toBe("This agreement is between {{client}} and us.");

    await expect(getContract(actingAsOrgBOwner, contract.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createContract(actingAsOrgBOwner, { title: "Cross-tenant template use", templateId: template.id })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects creating a contract with neither content nor a templateId", async () => {
    await expect(createContract(actingAsOrgAOwner, { title: "No content" })).rejects.toThrow(
      "Provide contract content directly"
    );
  });
});

describe("Contract lifecycle: send, public view, sign/decline", () => {
  it("walks a contract through SENT -> VIEWED -> SIGNED via the public link, never a stale snapshot", async () => {
    const contract = await createContract(actingAsOrgAOwner, {
      title: `Sign Me ${randomUUID()}`,
      content: "Standard terms.",
    });

    const { contract: sent } = await sendContractForSignature(actingAsOrgAOwner, contract.id, {
      signerName: "Jane Client",
      signerEmail: uniqueEmail("signer"),
    });
    expect(sent.status).toBe("SENT");
    expect(sent.publicToken).toBeTruthy();

    const firstView = await getContractByPublicToken(sent.publicToken!);
    expect(firstView.status).toBe("VIEWED");
    expect(firstView.viewedAt).not.toBeNull();

    const signed = await signContractPublicly(sent.publicToken!, "Jane Client", "203.0.113.5");
    expect(signed.status).toBe("SIGNED");

    const signatureRequest = await prisma.signatureRequest.findFirst({ where: { contractId: contract.id } });
    expect(signatureRequest?.status).toBe("SIGNED");
    expect(signatureRequest?.signedIpAddress).toBe("203.0.113.5");

    await expect(signContractPublicly(sent.publicToken!, "Jane Client", undefined)).rejects.toThrow(
      "already been responded to"
    );
  });

  it("supports decline, and rejects an unknown token", async () => {
    const contract = await createContract(actingAsOrgAOwner, {
      title: `Decline Me ${randomUUID()}`,
      content: "Standard terms.",
    });
    const { contract: sent } = await sendContractForSignature(actingAsOrgAOwner, contract.id, {
      signerName: "John Decliner",
      signerEmail: uniqueEmail("decliner"),
    });

    const declined = await declineContractPublicly(sent.publicToken!);
    expect(declined.status).toBe("DECLINED");

    await expect(getContractByPublicToken("not-a-real-token")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("E-signature webhook: signature verification and idempotency", () => {
  it("rejects a tampered or missing signature", async () => {
    const provider = new MockESignatureProvider();
    const { body } = provider.signPayloadForTesting({
      externalEventId: randomUUID(),
      type: "signed",
      providerRequestId: "mock_does_not_exist",
    });

    await expect(processESignatureWebhook(body, null)).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
    await expect(processESignatureWebhook(body, "not-the-real-signature")).rejects.toBeInstanceOf(
      InvalidWebhookSignatureError
    );
  });

  it("processes a valid webhook exactly once — a redelivered event is a no-op", async () => {
    const contract = await createContract(actingAsOrgAOwner, {
      title: `Webhook Signed ${randomUUID()}`,
      content: "Standard terms.",
    });
    const { signatureRequest } = await sendContractForSignature(actingAsOrgAOwner, contract.id, {
      signerName: "Webhook Signer",
      signerEmail: uniqueEmail("webhook-signer"),
    });

    const provider = new MockESignatureProvider();
    const externalEventId = randomUUID();
    const { body, signature } = provider.signPayloadForTesting({
      externalEventId,
      type: "signed",
      providerRequestId: signatureRequest.providerRequestId,
      signedName: "Webhook Signer",
      signedIpAddress: "198.51.100.7",
    });

    const first = await processESignatureWebhook(body, signature);
    expect(first.deduped).toBe(false);

    const updatedContract = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(updatedContract.status).toBe("SIGNED");

    const second = await processESignatureWebhook(body, signature);
    expect(second.deduped).toBe(true);

    const webhookEvents = await prisma.incomingWebhookEvent.findMany({ where: { externalEventId } });
    expect(webhookEvents.length).toBe(1);
  });
});

describe("Gated-conversion helper", () => {
  it("reports a signed contract linked to an opportunity, and false otherwise", async () => {
    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    const deal = await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Gated Deal ${randomUUID()}`,
    });

    expect(await hasSignedContractForOpportunity(actingAsOrgAOwner.organisationId, deal.id)).toBe(false);

    const contract = await createContract(actingAsOrgAOwner, {
      title: `Gated Contract ${randomUUID()}`,
      content: "Standard terms.",
      opportunityId: deal.id,
    });
    const { contract: sent } = await sendContractForSignature(actingAsOrgAOwner, contract.id, {
      signerName: "Gated Signer",
      signerEmail: uniqueEmail("gated-signer"),
    });
    await signContractPublicly(sent.publicToken!, "Gated Signer", undefined);

    expect(await hasSignedContractForOpportunity(actingAsOrgAOwner.organisationId, deal.id)).toBe(true);
  });
});
