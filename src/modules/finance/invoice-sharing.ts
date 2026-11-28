import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { InvoiceStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import { financeTransaction } from "./finance-transaction";

const issuedStatuses: InvoiceStatus[] = [
  "FINALISED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
];
const signingKey = () =>
  createHmac("sha256", env.AUTH_SECRET)
    .update("encifone:invoice-sharing:v1")
    .digest();
const signature = (nonce: string) =>
  createHmac("sha256", signingKey()).update(nonce).digest();

export function getInvoicePublicUrl(invoice: {
  publicLinkNonce: string | null;
  publicLinkExpiresAt: Date | null;
  status: string;
}) {
  if (
    !invoice.publicLinkNonce ||
    !invoice.publicLinkExpiresAt ||
    invoice.publicLinkExpiresAt <= new Date() ||
    !issuedStatuses.some((status) => status === invoice.status)
  )
    return undefined;
  const token = [
    invoice.publicLinkNonce,
    signature(invoice.publicLinkNonce).toString("base64url"),
  ].join(".");
  return new URL(`/online-invoice/${token}`, env.APP_URL).toString();
}

export async function changeInvoicePublicLink(
  acting: ActiveMembership,
  id: string,
  enable: boolean,
  expiryDays = 30,
) {
  requireCapability(acting, Capability.FINANCE_MANAGE);
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90)
    throw new Error("Choose an expiry between 1 and 90 days.");
  await financeTransaction(acting.organisationId, async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id,
        organisationId: acting.organisationId,
        invoiceNumber: { not: null },
        status: { in: issuedStatuses },
      },
      data: {
        publicLinkNonce: enable ? randomBytes(32).toString("base64url") : null,
        publicLinkExpiresAt: enable
          ? new Date(Date.now() + expiryDays * 86_400_000)
          : null,
      },
    });
    if (!result.count) throw new NotFoundError("Issued invoice not found.");
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: enable
          ? "invoice.public_link_created"
          : "invoice.public_link_revoked",
        resourceType: "Invoice",
        resourceId: id,
      },
      tx,
    );
  });
}

export function invoiceLinkNonce(token: string) {
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new NotFoundError("Invoice link unavailable.");
  const [nonce, proof] = token.split(".");
  if (!timingSafeEqual(Buffer.from(proof, "base64url"), signature(nonce)))
    throw new NotFoundError("Invoice link unavailable.");
  return nonce;
}

export async function getPublicInvoice(token: string) {
  const nonce = invoiceLinkNonce(token);
  const invoice = await prisma.invoice.findFirst({
    where: {
      publicLinkNonce: nonce,
      publicLinkExpiresAt: { gt: new Date() },
      status: { in: issuedStatuses },
      invoiceNumber: { not: null },
    },
    select: {
      organisationId: true,
      companyId: true,
      clientId: true,
      contactId: true,
      status: true,
      currency: true,
      invoiceNumber: true,
      documentSnapshot: true,
      issueDate: true,
      dueDate: true,
      paymentTermsDays: true,
      purchaseOrderReference: true,
      customerReference: true,
      subtotalMinor: true,
      taxMinor: true,
      discountMinor: true,
      totalMinor: true,
      balanceDueMinor: true,
      amountPaidMinor: true,
      lines: {
        orderBy: { position: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPriceMinor: true,
          taxRateBps: true,
          discountMinor: true,
          lineTotalMinor: true,
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice link unavailable.");
  return invoice;
}
