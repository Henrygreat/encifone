import { createHash } from "node:crypto";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import {
  getInvoicePaymentGateway,
  type InvoiceRefund,
} from "@/modules/payments/invoice-payment-gateway";
import { financeTransaction } from "./finance-transaction";

export async function refundInvoicePayment(
  acting: ActiveMembership,
  invoiceId: string,
  allocationId: string,
) {
  requireCapability(acting, Capability.FINANCE_MANAGE);
  const allocation = await prisma.invoicePaymentAllocation.findFirst({
    where: {
      id: allocationId,
      invoiceId,
      organisationId: acting.organisationId,
      invoice: { organisationId: acting.organisationId },
      payment: {
        organisationId: acting.organisationId,
        provider: "STRIPE",
        status: "SUCCEEDED",
      },
    },
    include: {
      payment: {
        include: { organisation: { select: { stripeInvoiceAccountId: true } } },
      },
    },
  });
  const account = allocation?.payment.organisation.stripeInvoiceAccountId;
  if (!account || !allocation)
    throw new NotFoundError("A refundable invoice payment was not found.");
  const payment = allocation.payment;
  const amountMinor = payment.amountMinor - payment.refundedMinor;
  if (!amountMinor || allocation.amountMinor !== payment.amountMinor)
    throw new ValidationError(["This allocation cannot be refunded."]);
  const key = createHash("sha256")
    .update(JSON.stringify([payment.id, amountMinor]))
    .digest("hex");
  const refund = await getInvoicePaymentGateway().refund(
    account,
    payment.providerPaymentId,
    amountMinor,
    payment.currency,
    `invoice-refund-${key}`,
  );
  if (refund.status === "failed")
    throw new ValidationError(["The provider could not refund the payment."]);
  await reconcileInvoiceRefund(account, refund);
  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "invoice.refund_requested",
    resourceType: "Invoice",
    resourceId: invoiceId,
    metadata: { amountMinor },
  });
  return refund.status;
}

export async function reconcileInvoiceRefund(
  account: string,
  refund: InvoiceRefund,
) {
  if (refund.status !== "succeeded" || !refund.paymentId) return;
  const scope = await prisma.payment.findFirst({
    where: {
      provider: "STRIPE",
      providerPaymentId: refund.paymentId,
      organisation: { stripeInvoiceAccountId: account },
      allocations: { some: {} },
    },
    select: { id: true, organisationId: true },
  });
  if (!scope) {
    const merchant = await prisma.organisation.findUnique({
      where: { stripeInvoiceAccountId: account },
      select: { id: true },
    });
    if (merchant)
      throw new Error("The invoice payment has not been reconciled yet.");
    return;
  }
  const { organisationId } = scope;
  await financeTransaction(organisationId, async (tx) => {
    if (
      await tx.invoicePaymentRefund.findUnique({
        where: { providerRefundId: refund.id },
      })
    )
      return;
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: scope.id, organisationId },
      include: {
        allocations: { where: { organisationId }, include: { invoice: true } },
      },
    });
    const allocation = payment.allocations[0];
    if (
      !allocation ||
      payment.allocations.length !== 1 ||
      allocation.invoice.organisationId !== organisationId ||
      payment.currency !== refund.currency ||
      !Number.isSafeInteger(refund.amountMinor) ||
      refund.amountMinor <= 0 ||
      refund.amountMinor > payment.amountMinor - payment.refundedMinor ||
      refund.amountMinor > allocation.invoice.amountPaidMinor
    ) {
      throw new Error(
        "Refund could not be matched to an invoice payment allocation.",
      );
    }
    const invoice = allocation.invoice;
    const refundedMinor = payment.refundedMinor + refund.amountMinor;
    const amountPaidMinor = invoice.amountPaidMinor - refund.amountMinor;
    await tx.invoicePaymentRefund.create({
      data: {
        providerRefundId: refund.id,
        paymentId: payment.id,
        amountMinor: refund.amountMinor,
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedMinor,
        status:
          refundedMinor === payment.amountMinor ? "REFUNDED" : "SUCCEEDED",
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidMinor,
        balanceDueMinor: { increment: refund.amountMinor },
        paidAt: null,
        status: amountPaidMinor ? "PARTIALLY_PAID" : "FINALISED",
      },
    });
    await writeAuditLog(
      {
        organisationId,
        actorUserId: null,
        action: "invoice.refund_reconciled",
        resourceType: "Invoice",
        resourceId: invoice.id,
        metadata: { paymentId: payment.id, amountMinor: refund.amountMinor },
      },
      tx,
    );
  });
}
