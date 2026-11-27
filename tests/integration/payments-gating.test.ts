import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// Mocked before any import that transitively pulls in the real Stripe SDK —
// no real network call is ever made in this test file. The mock simulates
// Stripe's actual idempotency-key behaviour (same key -> same resulting
// intent id) and a signature-verification boundary, so the service logic
// built around it is exercised faithfully without live credentials.
vi.mock("@/modules/payments/stripe-provider", () => ({
  createPaymentIntent: vi.fn(async (input: { idempotencyKey: string }) => ({
    providerPaymentId: `pi_test_${input.idempotencyKey}`,
    clientSecret: "secret_test",
  })),
  verifyStripeWebhookSignature: vi.fn((rawBody: string, signatureHeader: string | null) => {
    if (signatureHeader !== "VALID_TEST_SIGNATURE") {
      throw new Error("Invalid Stripe webhook signature.");
    }
    return JSON.parse(rawBody);
  }),
  isStripeConfigured: () => true,
  StripeNotConfiguredError: class StripeNotConfiguredError extends Error {},
}));

import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { updateOrganisationSettings } from "@/modules/identity/service";
import { createOpportunity, ensureDefaultPipeline, moveOpportunity } from "@/modules/sales/service";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import { createPayment, processStripeWebhook } from "@/modules/payments/service";
import { createContract, sendContractForSignature, signContractPublicly } from "@/modules/contracts/service";
import { membershipIdFor } from "../helpers/membership";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

async function freshOrg(prefix: string) {
  const owner = await registerOwner({
    name: `${prefix} Owner`,
    email: uniqueEmail(prefix),
    password: "password123",
    organisationName: `${prefix} Org ${randomUUID()}`,
  });
  createdOrgIds.push(owner.organisationId);
  createdUserIds.push(owner.userId);
  const acting: ActiveMembership = {
    userId: owner.userId,
    organisationId: owner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(owner.userId, owner.organisationId),
  };
  return acting;
}

afterAll(async () => {
  await prisma.incomingWebhookEvent.deleteMany({});
  await prisma.payment.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.signatureRequest.deleteMany({ where: { contract: { organisationId: { in: createdOrgIds } } } });
  await prisma.contractVersion.deleteMany({ where: { contract: { organisationId: { in: createdOrgIds } } } });
  await prisma.contract.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.client.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("createPayment idempotency", () => {
  it("reuses the same Payment row for a retried request with the same idempotency key", async () => {
    const acting = await freshOrg("payment-idempotency");
    const key = randomUUID();

    const first = await createPayment(acting, { amountMinor: 50000, currency: "GBP" }, key);
    const second = await createPayment(acting, { amountMinor: 50000, currency: "GBP" }, key);

    expect(first.id).toBe(second.id);
    const count = await prisma.payment.count({ where: { organisationId: acting.organisationId } });
    expect(count).toBe(1);
  });
});

describe("Stripe webhook: signature verification and idempotency", () => {
  it("rejects an unverifiable signature and processes a valid event exactly once", async () => {
    const acting = await freshOrg("stripe-webhook");
    const payment = await createPayment(acting, { amountMinor: 75000, currency: "GBP" }, randomUUID());

    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: payment.providerPaymentId } },
    };
    const body = JSON.stringify(event);

    await expect(processStripeWebhook(body, "WRONG_SIGNATURE")).rejects.toThrow("Invalid Stripe webhook signature");

    const first = await processStripeWebhook(body, "VALID_TEST_SIGNATURE");
    expect(first.deduped).toBe(false);
    if (!first.deduped) {
      expect(first.succeeded).toBe(true);
    }

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("SUCCEEDED");

    const second = await processStripeWebhook(body, "VALID_TEST_SIGNATURE");
    expect(second.deduped).toBe(true);
  });

  it("records a failed payment with its failure reason", async () => {
    const acting = await freshOrg("stripe-webhook-fail");
    const payment = await createPayment(acting, { amountMinor: 20000, currency: "GBP" }, randomUUID());

    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment_intent.payment_failed",
      data: { object: { id: payment.providerPaymentId, last_payment_error: { message: "Card declined." } } },
    };

    await processStripeWebhook(JSON.stringify(event), "VALID_TEST_SIGNATURE");

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.failureReason).toBe("Card declined.");
  });
});

describe("Gated conversion — payment gate", () => {
  it("defers Client creation until a succeeded payment exists, when the org requires one", async () => {
    const acting = await freshOrg("payment-gate");
    await updateOrganisationSettings(acting, { conversionRequiresPayment: true });

    const pipeline = await ensureDefaultPipeline(acting);
    const wonStage = pipeline.stages.find((s) => s.isWon)!;
    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Payment-Gated Deal ${randomUUID()}`,
    });

    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const noClientYet = await prisma.client.findUnique({ where: { originatingOpportunityId: deal.id } });
    expect(noClientYet).toBeNull();

    const payment = await createPayment(acting, { amountMinor: 100000, opportunityId: deal.id }, randomUUID());
    await processStripeWebhook(
      JSON.stringify({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", data: { object: { id: payment.providerPaymentId } } }),
      "VALID_TEST_SIGNATURE"
    );

    // The webhook route (not processStripeWebhook itself) is what calls
    // attemptGatedConversion — simulate that final step here.
    const client = await attemptGatedConversion(acting.organisationId, deal.id);
    expect(client).not.toBeNull();

    const createdClient = await prisma.client.findUnique({ where: { originatingOpportunityId: deal.id } });
    expect(createdClient).not.toBeNull();
  });
});

describe("Gated conversion — contract gate", () => {
  it("defers Client creation until a contract is signed, when the org requires one", async () => {
    const acting = await freshOrg("contract-gate");
    await updateOrganisationSettings(acting, { conversionRequiresContract: true });

    const pipeline = await ensureDefaultPipeline(acting);
    const wonStage = pipeline.stages.find((s) => s.isWon)!;
    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Contract-Gated Deal ${randomUUID()}`,
    });

    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });
    expect(await prisma.client.findUnique({ where: { originatingOpportunityId: deal.id } })).toBeNull();

    const contract = await createContract(acting, {
      title: `Gate Contract ${randomUUID()}`,
      content: "Standard terms.",
      opportunityId: deal.id,
    });
    const { contract: sent } = await sendContractForSignature(acting, contract.id, {
      signerName: "Gate Signer",
      signerEmail: uniqueEmail("gate-signer"),
    });
    await signContractPublicly(sent.publicToken!, "Gate Signer", undefined);

    const client = await attemptGatedConversion(acting.organisationId, deal.id);
    expect(client).not.toBeNull();
  });
});

describe("Default behaviour (both gates off) is unchanged", () => {
  it("creates the Client immediately on entering a Won stage, same as before gating existed", async () => {
    const acting = await freshOrg("no-gate");
    const pipeline = await ensureDefaultPipeline(acting);
    const wonStage = pipeline.stages.find((s) => s.isWon)!;
    const deal = await createOpportunity(acting, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Ungated Deal ${randomUUID()}`,
    });

    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });

    const client = await prisma.client.findUnique({ where: { originatingOpportunityId: deal.id } });
    expect(client).not.toBeNull();
  });
});
