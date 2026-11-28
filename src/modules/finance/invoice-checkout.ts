import { createHash } from "node:crypto";
import { InvoiceStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import {
  getInvoicePaymentGateway,
  invoiceGatewayConfigured,
  type InvoiceCheckoutSession,
} from "@/modules/payments/invoice-payment-gateway";
import { financialDocumentSettingsSchema } from "./document-settings";
import { financeTransaction } from "./finance-transaction";
import { invoiceLinkNonce } from "./invoice-sharing";

const payable: InvoiceStatus[] = ["FINALISED", "PARTIALLY_PAID", "OVERDUE"];

function paymentsEnabled(settings: unknown) {
  const parsed = financialDocumentSettingsSchema.safeParse(settings);
  return parsed.success && parsed.data.payOnline === true;
}

export async function invoiceCheckoutAvailable(organisationId: string) {
  if (!invoiceGatewayConfigured()) return false;
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { stripeInvoiceAccountId: true, financialDocumentSettings: true },
  });
  if (
    !org?.stripeInvoiceAccountId ||
    !paymentsEnabled(org.financialDocumentSettings)
  )
    return false;
  return getInvoicePaymentGateway()
    .capabilities(org.stripeInvoiceAccountId)
    .then(
      ({ checkout }) => checkout,
      () => false,
    );
}

export async function connectInvoiceMerchant(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const gateway = getInvoicePaymentGateway();
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: acting.organisationId },
    select: { stripeInvoiceAccountId: true },
  });
  let account = org.stripeInvoiceAccountId;
  if (!account) {
    const key = createHash("sha256")
      .update(`encifone-connect:${acting.organisationId}`)
      .digest("hex");
    const candidate = await gateway.createMerchant(key);
    account = await financeTransaction(acting.organisationId, async (tx) => {
      const existing = await tx.organisation.findUniqueOrThrow({
        where: { id: acting.organisationId },
        select: { stripeInvoiceAccountId: true },
      });
      if (existing.stripeInvoiceAccountId)
        return existing.stripeInvoiceAccountId;
      await tx.organisation.update({
        where: { id: acting.organisationId },
        data: { stripeInvoiceAccountId: candidate },
      });
      await writeAuditLog(
        {
          organisationId: acting.organisationId,
          actorUserId: acting.userId,
          action: "finance.merchant_connected",
          resourceType: "Organisation",
          resourceId: acting.organisationId,
        },
        tx,
      );
      return candidate;
    });
  }
  return gateway.onboardingUrl(
    account,
    new URL("/finance-settings", env.APP_URL).toString(),
  );
}

export async function startInvoiceCheckout(token: string) {
  const nonce = invoiceLinkNonce(token);
  const gateway = getInvoicePaymentGateway();
  const sharing = await prisma.invoice.findFirst({
    where: {
      publicLinkNonce: nonce,
      publicLinkExpiresAt: { gt: new Date() },
      status: { in: payable },
      balanceDueMinor: { gt: 0 },
    },
    select: {
      organisationId: true,
      organisation: { select: { stripeInvoiceAccountId: true } },
    },
  });
  if (!sharing) throw new NotFoundError("Invoice link unavailable.");
  const { organisationId } = sharing;
  const merchant = sharing.organisation.stripeInvoiceAccountId;
  if (!merchant || !(await gateway.capabilities(merchant)).checkout)
    throw new ValidationError(["Online payments are unavailable."]);
  const attempt = await financeTransaction(organisationId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        organisationId,
        publicLinkNonce: nonce,
        publicLinkExpiresAt: { gt: new Date() },
        status: { in: payable },
        balanceDueMinor: { gt: 0 },
      },
      select: {
        id: true,
        balanceDueMinor: true,
        currency: true,
        organisation: {
          select: {
            stripeInvoiceAccountId: true,
            financialDocumentSettings: true,
          },
        },
      },
    });
    if (!invoice)
      throw new NotFoundError("Invoice is unavailable for payment.");
    const account = invoice.organisation.stripeInvoiceAccountId;
    if (
      account !== merchant ||
      !paymentsEnabled(invoice.organisation.financialDocumentSettings)
    )
      throw new ValidationError(["Online payments are unavailable."]);
    const now = new Date();
    const open = await tx.invoiceCheckoutAttempt.findFirst({
      where: {
        invoiceId: invoice.id,
        closedAt: null,
        OR: [{ providerSessionId: { not: null } }, { expiresAt: { gt: now } }],
      },
    });
    if (open) return open;
    return tx.invoiceCheckoutAttempt.create({
      data: {
        invoiceId: invoice.id,
        accountId: account,
        amountMinor: invoice.balanceDueMinor,
        currency: invoice.currency,
        expiresAt: new Date(now.getTime() + 45 * 60_000),
      },
    });
  });

  const session = attempt.providerSessionId
    ? await gateway.retrieveCheckout(
        attempt.accountId,
        attempt.providerSessionId,
      )
    : await gateway.createCheckout({
        account: attempt.accountId,
        attemptId: attempt.id,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        expiresAt: attempt.expiresAt,
        returnUrl: new URL(`/online-invoice/${token}`, env.APP_URL).toString(),
      });
  if (session.status !== "open" || !session.url) {
    await settleCheckout(attempt.accountId, session);
    return new URL(`/online-invoice/${token}`, env.APP_URL).toString();
  }
  return financeTransaction(organisationId, async (tx) => {
    const result = await tx.invoiceCheckoutAttempt.updateMany({
      where: {
        id: attempt.id,
        closedAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ providerSessionId: null }, { providerSessionId: session.id }],
        invoice: {
          publicLinkNonce: nonce,
          publicLinkExpiresAt: { gt: new Date() },
        },
      },
      data: { providerSessionId: session.id },
    });
    if (!result.count || !session.url)
      throw new ValidationError(["The checkout link expired."]);
    return session.url;
  });
}

export async function settleCheckout(
  account: string,
  session: InvoiceCheckoutSession,
) {
  if (!session.attemptId) return;
  const attempt = await prisma.invoiceCheckoutAttempt.findUnique({
    where: { id: session.attemptId },
    select: { id: true, invoice: { select: { organisationId: true } } },
  });
  if (!attempt) return;
  const { organisationId } = attempt.invoice;
  await financeTransaction(organisationId, async (tx) => {
    const current = await tx.invoiceCheckoutAttempt.findFirst({
      where: {
        id: attempt.id,
        accountId: account,
        providerSessionId: session.id,
        closedAt: null,
        invoice: { organisationId },
      },
      include: { invoice: true },
    });
    if (!current) return;
    const now = new Date();
    if (session.status === "expired") {
      await tx.invoiceCheckoutAttempt.update({
        where: { id: current.id },
        data: { closedAt: now },
      });
      return;
    }
    if (
      session.status !== "complete" ||
      !session.paid ||
      !session.paymentId ||
      session.amountMinor !== current.amountMinor ||
      session.currency !== current.currency ||
      current.invoice.balanceDueMinor < current.amountMinor ||
      !payable.includes(current.invoice.status)
    ) {
      throw new Error(
        "Checkout could not be reconciled against its reserved invoice balance.",
      );
    }
    const invoice = current.invoice;
    const payment = await tx.payment.create({
      data: {
        organisationId,
        companyId: invoice.companyId,
        contactId: invoice.contactId,
        provider: "STRIPE",
        method: "STRIPE",
        status: "SUCCEEDED",
        providerPaymentId: session.paymentId,
        amountMinor: current.amountMinor,
        currency: current.currency,
        receivedAt: now,
      },
    });
    await tx.invoicePaymentAllocation.create({
      data: {
        organisationId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        amountMinor: current.amountMinor,
      },
    });
    const balanceDueMinor = invoice.balanceDueMinor - current.amountMinor;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidMinor: { increment: current.amountMinor },
        balanceDueMinor,
        status: balanceDueMinor ? "PARTIALLY_PAID" : "PAID",
        paidAt: balanceDueMinor ? null : now,
      },
    });
    await tx.invoiceCheckoutAttempt.update({
      where: { id: current.id },
      data: { closedAt: now },
    });
    await writeAuditLog(
      {
        organisationId,
        actorUserId: null,
        action: "invoice.online_payment_recorded",
        resourceType: "Invoice",
        resourceId: invoice.id,
        metadata: { paymentId: payment.id, allocated: current.amountMinor },
      },
      tx,
    );
  });
}
