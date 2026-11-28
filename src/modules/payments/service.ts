import crypto from "crypto";
import { PaymentProvider, PaymentStatus, Prisma, WebhookProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { createPaymentIntent, verifyStripeWebhookSignature } from "./stripe-provider";
import type { CreatePaymentIntentInput, ListPaymentsQuery } from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

export async function listPayments(acting: ActiveMembership, query: ListPaymentsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.PaymentWhereInput = {
    organisationId: acting.organisationId,
    provider: PaymentProvider.STRIPE,
    ...(query.status ? { status: query.status } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

/**
 * Creates a Stripe test-mode PaymentIntent and the local Payment record
 * that tracks it (PENDING until the webhook confirms success/failure —
 * never marked SUCCEEDED from this call itself, since Stripe hasn't
 * actually processed the payment yet at creation time). Idempotent:
 * passing the same `idempotencyKey` for a retried request returns the
 * same Stripe PaymentIntent rather than creating a second one.
 */
export async function createPayment(
  acting: ActiveMembership,
  input: CreatePaymentIntentInput,
  idempotencyKey: string
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!opportunity) throw new NotFoundError("The selected opportunity was not found in this organisation.");
  }

  const currency = input.currency ?? "GBP";
  const { providerPaymentId } = await createPaymentIntent({
    amountMinor: input.amountMinor,
    currency,
    metadata: {
      organisationId: acting.organisationId,
      opportunityId: input.opportunityId ?? "",
    },
    idempotencyKey,
  });

  const payment = await prisma.payment.upsert({
    where: { providerPaymentId },
    create: {
      organisationId: acting.organisationId,
      opportunityId: input.opportunityId,
      companyId: input.companyId,
      contactId: input.contactId,
      provider: PaymentProvider.STRIPE,
      providerPaymentId,
      amountMinor: input.amountMinor,
      currency,
      status: PaymentStatus.PENDING,
    },
    update: {},
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "payment.intent_created",
    resourceType: "Payment",
    resourceId: payment.id,
    metadata: { amountMinor: input.amountMinor, currency, opportunityId: input.opportunityId },
  });

  return payment;
}

/**
 * Verifies the Stripe signature, dedupes via IncomingWebhookEvent (a
 * redelivered event is a no-op on its second+ delivery), and updates the
 * Payment's status from payment_intent.succeeded/payment_intent.
 * payment_failed. Deliberately does NOT attempt gated conversion itself
 * (src/modules/sales/conversion.ts depends on this module, so this module
 * calling back into it would be circular) — the webhook route calls
 * attemptGatedConversion with this function's result's opportunityId.
 */
export async function processStripeWebhook(rawBody: string, signatureHeader: string | null) {
  const event = verifyStripeWebhookSignature(rawBody, signatureHeader);

  const alreadyProcessed = await prisma.incomingWebhookEvent.findUnique({
    where: { provider_externalEventId: { provider: WebhookProvider.STRIPE, externalEventId: event.id } },
  });
  if (alreadyProcessed) {
    return { deduped: true as const };
  }
  await prisma.incomingWebhookEvent.create({
    data: { provider: WebhookProvider.STRIPE, externalEventId: event.id, payload: event as unknown as Prisma.InputJsonValue },
  });

  if (event.type !== "payment_intent.succeeded" && event.type !== "payment_intent.payment_failed") {
    return { deduped: false as const, handled: false as const };
  }

  const intent = event.data.object as { id: string; last_payment_error?: { message?: string } | null };
  const payment = await prisma.payment.findUnique({ where: { providerPaymentId: intent.id } });
  if (!payment) {
    throw new NotFoundError("No Payment record matches this webhook's PaymentIntent id.");
  }

  const succeeded = event.type === "payment_intent.succeeded";
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: succeeded
      ? { status: PaymentStatus.SUCCEEDED, failureReason: null }
      : { status: PaymentStatus.FAILED, failureReason: intent.last_payment_error?.message ?? "Payment failed." },
  });

  await writeAuditLog({
    organisationId: payment.organisationId,
    actorUserId: null,
    action: succeeded ? "payment.succeeded" : "payment.failed",
    resourceType: "Payment",
    resourceId: payment.id,
    metadata: { stripeEventId: event.id },
  });

  return { deduped: false as const, handled: true as const, payment: updated, succeeded };
}

/** Used by src/modules/clients/service.ts's gated-conversion check. */
export async function hasSucceededPaymentForOpportunity(organisationId: string, opportunityId: string): Promise<boolean> {
  const count = await prisma.payment.count({
    where: { organisationId, opportunityId, status: PaymentStatus.SUCCEEDED },
  });
  return count > 0;
}

/** A stable idempotency key for a payment-creation request — callers that
 * want to guard against a double-click retry pass the same key twice. */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
