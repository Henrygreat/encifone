import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import {
  invoiceDocumentData,
  snapshotInvoiceDocument,
} from "./document-settings";
import { renderFinancialDocument } from "./document-renderer";
import { getEstimate, getInvoice } from "./service";

export async function renderSecondaryDocument(
  acting: ActiveMembership,
  kind: string,
  id: string,
  reference?: string,
) {
  requireCapability(acting, Capability.FINANCE_VIEW);
  if (kind === "estimate") {
    const estimate = await getEstimate(acting, id);
    const version = estimate.versions[0];
    if (!version) throw new NotFoundError("Estimate pricing not found.");
    const data = await invoiceDocumentData(
      {
        ...version,
        status: estimate.status,
        documentSnapshot: estimate.documentSnapshot,
        invoiceNumber: null,
        issueDate: estimate.sentAt,
        dueDate: estimate.validUntil ?? estimate.expiresAt,
        paymentTermsDays: 0,
        currency: estimate.currency,
        amountPaidMinor: 0,
        balanceDueMinor: version.totalMinor,
      },
      estimate,
    );
    return renderFinancialDocument({
      ...data,
      template: data.estimateTemplate ?? data.template,
      notes: data.notes.slice(0, 1),
      title: "Estimate",
      reference: estimate.title,
      draft: estimate.status === "DRAFT",
      details: data.details
        .filter(({ label }) => label !== "Payment terms")
        .map((detail) =>
          detail.label === "Due date"
            ? { ...detail, label: "Valid until" }
            : detail,
        ),
      summary: data.summary
        .filter(({ label }) => label !== "Outstanding balance")
        .map((total) => ({
          ...total,
          label:
            total.label === "Invoice total" ? "Estimate total" : total.label,
        })),
    });
  }
  if (kind === "statement") {
    const client = await prisma.client.findFirst({
      where: { id, organisationId: acting.organisationId },
    });
    if (!client) throw new NotFoundError("Client not found.");
    const { defaultCurrency: currency } =
      await prisma.organisation.findUniqueOrThrow({
        where: { id: acting.organisationId },
        select: { defaultCurrency: true },
      });
    const invoices = await prisma.invoice.findMany({
      where: {
        organisationId: acting.organisationId,
        clientId: id,
        currency,
        status: { in: ["FINALISED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      },
      orderBy: { invoiceNumber: "asc" },
      select: {
        invoiceNumber: true,
        totalMinor: true,
        balanceDueMinor: true,
        issueDate: true,
      },
    });
    const party = await snapshotInvoiceDocument(prisma, {
      organisationId: acting.organisationId,
      clientId: id,
      companyId: null,
      contactId: null,
    });
    return renderFinancialDocument({
      template: party.settings.template,
      title: "Account statement",
      seller: [party.settings.legalName || party.sellerName],
      customer: party.customer,
      currency,
      details: [
        { label: "As of", value: new Date().toISOString().slice(0, 10) },
        { label: "Currency", value: currency },
      ],
      lines: invoices.map((invoice) => ({
        description: `Invoice ${invoice.invoiceNumber}${invoice.issueDate ? ` · ${invoice.issueDate.toISOString().slice(0, 10)}` : ""} · Open balance`,
        quantity: 1,
        unitPriceMinor: invoice.balanceDueMinor,
        lineTotalMinor: invoice.balanceDueMinor,
        discountMinor: 0,
        taxRateBps: 0,
      })),
      summary: [
        {
          label: "Outstanding balance",
          minor: invoices.reduce(
            (sum, invoice) => sum + invoice.balanceDueMinor,
            0,
          ),
        },
      ],
    });
  }
  if (!["proforma", "credit-note", "receipt"].includes(kind))
    throw new NotFoundError("Document type not found.");
  const invoice = await getInvoice(acting, id);
  const data = await invoiceDocumentData(invoice, invoice);
  if (kind === "proforma" && invoice.status === "DRAFT") {
    return renderFinancialDocument({
      ...data,
      title: "Proforma invoice",
      draft: true,
      details: [
        { label: "Document", value: "Proforma — payment is not requested" },
      ],
      notes: [],
    });
  }
  if (kind === "credit-note") {
    const credit = invoice.creditNotes.find((note) => note.id === reference);
    if (!credit) throw new NotFoundError("Credit note not found.");
    return renderFinancialDocument({
      ...data,
      template: data.creditNoteTemplate ?? data.template,
      title: "Credit note",
      reference: credit.number,
      status: credit.status,
      lines: [],
      notes: [credit.reason],
      details: [
        { label: "Invoice", value: data.reference ?? "" },
        { label: "Issued", value: credit.issuedAt.toISOString().slice(0, 10) },
      ],
      summary: [{ label: "Credit amount", minor: credit.amountMinor }],
    });
  }
  if (kind === "receipt") {
    const allocation = invoice.allocations.find(
      (item) =>
        item.id === reference &&
        item.organisationId === acting.organisationId &&
        item.payment.organisationId === acting.organisationId &&
        ["SUCCEEDED", "REFUNDED"].includes(item.payment.status),
    );
    if (!allocation) throw new NotFoundError("Payment receipt not found.");
    return renderFinancialDocument({
      ...data,
      template: data.receiptTemplate ?? data.template,
      title: "Payment receipt",
      reference:
        allocation.payment.receiptNumber ??
        allocation.payment.externalReference ??
        undefined,
      status: undefined,
      lines: [],
      notes: [],
      details: [
        { label: "Invoice", value: data.reference ?? "" },
        {
          label: "Recorded",
          value: (allocation.payment.receivedAt ?? allocation.allocatedAt)
            .toISOString()
            .slice(0, 10),
        },
      ],
      summary: [
        { label: "Payment received", minor: allocation.amountMinor },
        ...(allocation.payment.refundedMinor
          ? [
              { label: "Refunded", minor: -allocation.payment.refundedMinor },
              {
                label: "Net payment applied",
                minor:
                  allocation.amountMinor - allocation.payment.refundedMinor,
              },
            ]
          : []),
      ],
    });
  }
  throw new NotFoundError("Document not found.");
}
