import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { registerOwner } from "@/modules/identity/service";
import { createProject } from "@/modules/projects/service";
import {
  acceptPortalEstimate, createCreditNote, createEstimate, createInvoice, createRetainer, createSubscription, finaliseInvoice,
  generatePortalInvoicePdf, getFinanceDocumentOptions, getFinancialForecast, getFinancialMetrics, getInvoice,
  listFinancePayments, listPortalEstimates, listPortalInvoices, logRetainerUsage, recordInvoicePayment, runRecurringBilling, updateEstimate,
} from "@/modules/finance/service";
import { membershipIdFor } from "../helpers/membership";
import { saveFinancialDocumentSettings } from "@/modules/finance/document-settings";
import { changeInvoicePublicLink, getInvoicePublicUrl, getPublicInvoice } from "@/modules/finance/invoice-sharing";
import { settleCheckout } from "@/modules/finance/invoice-checkout";
import { reconcileInvoiceRefund } from "@/modules/finance/invoice-refunds";
import { renderSecondaryDocument } from "@/modules/finance/secondary-documents";

const owners: ActiveMembership[] = [];
const line = { quantity: 3, description: "Approved work", unitPriceMinor: 101, discountMinor: 2, taxRateBps: 2000 };

async function owner() {
  const token = randomUUID();
  const result = await registerOwner({
    name: "Finance owner", email: `finance-${token}@test.clientos.invalid`,
    password: "password123", organisationName: `Finance ${token}`,
  });
  const acting: ActiveMembership = {
    ...result, role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(result.userId, result.organisationId),
  };
  owners.push(acting);
  return acting;
}

let staff: ActiveMembership;
let other: ActiveMembership;

beforeAll(async () => {
  staff = await owner();
  other = await owner();
});

afterAll(async () => {
  for (const { organisationId, userId } of owners) {
    await prisma.auditLog.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } });
    await prisma.user.delete({ where: { id: userId } });
  }
});

describe("Phase 4 finance", () => {
  it("scopes estimates, converts once, and reconciles concurrent payments exactly", async () => {
    const organisationId = staff.organisationId;
    const client = await prisma.client.create({ data: { organisationId, name: "Finance client" } });
    const session = { organisationId, clientId: client.id, portalUserId: "test-portal-principal" };
    const estimate = await createEstimate(staff, { clientId: client.id, title: "Quote", lines: [line] });
    expect((await renderSecondaryDocument(staff, "estimate", estimate.id)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await listPortalEstimates(organisationId, client.id)).toEqual([]);
    await expect(createEstimate(other, { clientId: client.id, title: "Cross-tenant", lines: [line] })).rejects.toThrow(/not found/i);
    await updateEstimate(staff, estimate.id, { status: "SENT" });
    await expect(acceptPortalEstimate({ ...session, clientId: "another-client" }, estimate.id)).rejects.toThrow(/not found/i);
    await Promise.all([acceptPortalEstimate(session, estimate.id), acceptPortalEstimate(session, estimate.id)]);
    const invoices = await prisma.invoice.findMany({ where: { organisationId, estimateId: estimate.id } });
    expect(invoices).toHaveLength(1);
    const [draft] = invoices;
    expect((await renderSecondaryDocument(staff, "proforma", draft.id)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await listPortalInvoices(organisationId, client.id)).toEqual([]);
    await expect(generatePortalInvoicePdf(session, draft.id)).rejects.toThrow(/not found/i);
    await expect(getInvoice(other, draft.id)).rejects.toThrow(/not found/i);
    await expect(finaliseInvoice({ ...staff, role: "CLIENT_USER" }, draft.id)).rejects.toThrow(/permission/i);
    const issued = await finaliseInvoice(staff, draft.id);
    expect(issued).toMatchObject({ subtotalMinor: 303, discountMinor: 2, taxMinor: 60, totalMinor: 361, status: "FINALISED" });
    const first = { externalReference: "bank-100", amountMinor: 100, currency: "GBP", method: "BANK_TRANSFER", allocateToInvoice: true } as const;
    const second = { ...first, externalReference: "bank-261", amountMinor: 261 };
    const results = await Promise.all([
      recordInvoicePayment(staff, draft.id, first),
      recordInvoicePayment(staff, draft.id, first),
      recordInvoicePayment(staff, draft.id, second),
    ]);
    expect(results[0].payment.id).toBe(results[1].payment.id);
    const paid = await getInvoice(staff, draft.id);
    expect(paid).toMatchObject({ status: "PAID", amountPaidMinor: 361, balanceDueMinor: 0 });
    expect(paid.allocations).toHaveLength(2);
    expect((await renderSecondaryDocument(staff, "receipt", draft.id, paid.allocations[0].id)).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await renderSecondaryDocument(staff, "statement", client.id)).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(renderSecondaryDocument(other, "statement", client.id)).rejects.toThrow(/client not found/i);
    const ledger = await listFinancePayments(staff, 1);
    expect(ledger.items).toHaveLength(2);
    expect(ledger.items[0].allocations[0].invoice.id).toBe(draft.id);
    expect(ledger.items[0]).not.toHaveProperty("providerPaymentId");
    expect((await listFinancePayments(other, 1)).items).toEqual([]);
    await expect(listFinancePayments({ ...staff, role: "CLIENT_USER" }, 1)).rejects.toThrow(/permission/i);
    const [published] = await listPortalInvoices(organisationId, client.id);
    expect(published).not.toHaveProperty("internalNotes");
    expect(published).not.toHaveProperty("allocations");
    expect((await generatePortalInvoicePdf(session, draft.id)).subarray(0, 4).toString()).toBe("%PDF");
    expect(await prisma.auditLog.count({ where: { organisationId, resourceId: draft.id, action: "invoice.payment_recorded" } })).toBe(2);
  });

  it("invoices an approved time entry once and derives the portal client from the work", async () => {
    const { organisationId, membershipId } = staff;
    const client = await prisma.client.create({ data: { organisationId, name: "Project client" } });
    const project = await createProject(staff, { clientId: client.id, name: "Billable work", memberIds: [] });
    const service = await prisma.serviceItem.create({
      data: { organisationId, name: "Billable catalogue item", unitPriceMinor: 101, currency: "GBP" },
    });
    const options = await getFinanceDocumentOptions(staff);
    expect(options.projects).toContainEqual({ id: project.id, name: project.name, clientId: client.id });
    expect(options.services).toContainEqual({ id: service.id, name: service.name, unitPriceMinor: 101, currency: "GBP" });
    expect(await getFinanceDocumentOptions(other)).toEqual({ clients: [], projects: [], services: [] });
    const entry = await prisma.timeEntry.create({
      data: { organisationId, membershipId, projectId: project.id, workDate: new Date(), minutes: 90 },
    });
    const input = { creationKey: randomUUID(), timeEntryId: entry.id, paymentTermsDays: 30, lines: [{ ...line, serviceItemId: service.id }] };
    await expect(createInvoice(staff, input)).rejects.toMatchObject({ issues: ["Approved billable time must belong to a client project."] });
    await prisma.timeEntry.update({ where: { id: entry.id }, data: { approvalStatus: "APPROVED" } });
    const [invoice, retry] = await Promise.all([createInvoice(staff, input), createInvoice(staff, { ...input, creationKey: randomUUID() })]);
    expect(retry.id).toBe(invoice.id);
    expect(invoice).toMatchObject({ projectId: project.id, clientId: client.id, timeEntryId: entry.id });
    expect(invoice.lines[0]).toMatchObject({ serviceItemId: service.id, unitPriceMinor: 101 });
  });

  it("generates one recurring draft per due date and excludes foreign currencies from base-currency MRR", async () => {
    const startDate = new Date(Date.now() - 1000);
    const subscription = { title: "Maintenance", startDate, billingInterval: "MONTHLY", intervalCount: 2, amountMinor: 5000 } as const;
    await createSubscription(staff, { ...subscription, currency: "GBP", nextBillingDate: startDate });
    await createSubscription(staff, { ...subscription, currency: "USD", amountMinor: 9000 });
    const runs = await Promise.all([runRecurringBilling(staff), runRecurringBilling(staff)]);
    expect(runs.flatMap((run) => run.createdInvoiceIds)).toHaveLength(1);
    expect(await getFinancialMetrics(staff)).toMatchObject({ currency: "GBP", mrrMinor: 2500, arrMinor: 30000 });
    const forecast = await getFinancialForecast(staff, { months: 6 });
    expect(forecast.periods.filter((period) => period.contractedRecurringMinor === 5000)).toHaveLength(2);
    expect(forecast.periods.every((period) => period.contractedRecurringMinor <= 5000)).toBe(true);
  });

  it("applies credits without changing the issued total, and reconciles the residual balance", async () => {
    const draft = await createInvoice(staff, { creationKey: randomUUID(), currency: "JPY", paymentTermsDays: 30, lines: [line] });
    await finaliseInvoice(staff, draft.id);
    const { credit } = await createCreditNote(staff, draft.id, { amountMinor: 61, reason: "Agreed adjustment" });
    expect((await renderSecondaryDocument(staff, "credit-note", draft.id, credit.id)).subarray(0, 5).toString()).toBe("%PDF-");
    const result = await recordInvoicePayment(staff, draft.id, {
      externalReference: "bank-jpy-300", amountMinor: 300, currency: "JPY", method: "BANK_TRANSFER", allocateToInvoice: true,
    });
    expect(result.invoice).toMatchObject({ totalMinor: 361, amountPaidMinor: 300, balanceDueMinor: 0, status: "PAID" });
  });

  it("snapshots issued branding and enforces signing, revocation and expiry on public links", async () => {
    await saveFinancialDocumentSettings(staff, { template: "corporate", prefix: "INV-", legalName: "Original legal identity" });
    const draft = await createInvoice(staff, { creationKey: randomUUID(), paymentTermsDays: 30, lines: [line] });
    await expect(changeInvoicePublicLink(staff, draft.id, true)).rejects.toThrow(/issued invoice not found/i);
    await finaliseInvoice(staff, draft.id);
    await saveFinancialDocumentSettings(staff, { template: "modern", prefix: "NEW-", legalName: "New legal identity" });
    await expect(changeInvoicePublicLink(other, draft.id, true)).rejects.toThrow(/issued invoice not found/i);
    await changeInvoicePublicLink(staff, draft.id, true);
    const getToken = async () => new URL(getInvoicePublicUrl(await getInvoice(staff, draft.id))!).pathname.split("/").at(-1)!;
    const first = await getToken();
    const publicInvoice = await getPublicInvoice(first);
    expect(publicInvoice.documentSnapshot).toMatchObject({ settings: { template: "corporate", prefix: "INV-", legalName: "Original legal identity" } });
    expect(publicInvoice).not.toHaveProperty("id");
    expect(publicInvoice).not.toHaveProperty("internalNotes");
    await expect(getPublicInvoice(first.replace(/^./, (value) => value === "A" ? "B" : "A"))).rejects.toThrow(/unavailable/i);
    await changeInvoicePublicLink(staff, draft.id, true);
    const second = await getToken();
    await expect(getPublicInvoice(first)).rejects.toThrow(/unavailable/i);
    await changeInvoicePublicLink(staff, draft.id, false);
    await expect(getPublicInvoice(second)).rejects.toThrow(/unavailable/i);
    await changeInvoicePublicLink(staff, draft.id, true);
    const expired = await getToken();
    await prisma.invoice.update({ where: { id: draft.id }, data: { publicLinkExpiresAt: new Date(0) } });
    await expect(getPublicInvoice(expired)).rejects.toThrow(/unavailable/i);
  });

  it("renews a retainer once and invoices incremental overage for the closing period", async () => {
    const now = Date.now();
    const renewal = new Date(now + 60_000);
    const retainer = await createRetainer(staff, {
      title: "Support retainer", type: "HOUR_BASED", currency: "GBP", monthlyFeeMinor: 1000,
      includedMinutes: 60, overageRateMinor: 10, startDate: new Date(now - 60_000), nextRenewalAt: renewal,
    });
    await logRetainerUsage(staff, retainer.id, { minutesUsed: 70 });
    await logRetainerUsage(staff, retainer.id, { minutesUsed: 5 });
    const results = await Promise.all([runRecurringBilling(staff, renewal), runRecurringBilling(staff, renewal)]);
    expect(results.flatMap((result) => result.createdInvoiceIds)).toHaveLength(1);
    expect(await prisma.invoice.findFirst({ where: { retainerId: retainer.id } })).toMatchObject({ totalMinor: 1150 });
    expect(await prisma.retainer.findUnique({ where: { id: retainer.id } })).toMatchObject({ usedMinutes: 0, periodStartAt: renewal });
  });

  it("reserves the balance, checks account and amount, and allocates a successful Stripe checkout once", async () => {
    const draft = await createInvoice(staff, { creationKey: randomUUID(), lines: [line] });
    await finaliseInvoice(staff, draft.id);
    const attempt = await prisma.invoiceCheckoutAttempt.create({
      data: {
        invoiceId: draft.id, accountId: "acct_finance_test", providerSessionId: "cs_finance_test",
        amountMinor: 361, currency: "GBP", expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(recordInvoicePayment(staff, draft.id, {
      amountMinor: 1, currency: "GBP", method: "CASH", externalReference: "reserved-checkout-test", allocateToInvoice: true,
    })).rejects.toMatchObject({ issues: ["An online checkout is awaiting completion or expiry for this invoice."] });
    const event = {
      id: "cs_finance_test", status: "complete", url: null, paid: true,
      attemptId: attempt.id, amountMinor: 361, currency: "GBP", paymentId: "pi_finance_test",
    } as const;
    await settleCheckout("acct_other_test", event);
    expect((await getInvoice(staff, draft.id)).balanceDueMinor).toBe(361);
    await expect(settleCheckout(attempt.accountId, { ...event, amountMinor: 360 })).rejects.toThrow(/reserved invoice balance/);
    await Promise.all([settleCheckout(attempt.accountId, event), settleCheckout(attempt.accountId, event)]);
    const invoice = await getInvoice(staff, draft.id);
    expect(invoice.status).toBe("PAID");
    expect(invoice.amountPaidMinor).toBe(361);
    expect(invoice.allocations).toHaveLength(1);
    await prisma.organisation.update({ where: { id: staff.organisationId }, data: { stripeInvoiceAccountId: attempt.accountId } });
    const refund = { id: "re_finance_test", paymentId: event.paymentId, amountMinor: 100, currency: "GBP", status: "succeeded" } as const;
    await reconcileInvoiceRefund("acct_other_test", refund);
    expect((await getInvoice(staff, draft.id)).amountPaidMinor).toBe(361);
    await Promise.all([reconcileInvoiceRefund(attempt.accountId, refund), reconcileInvoiceRefund(attempt.accountId, refund)]);
    expect(await getInvoice(staff, draft.id)).toMatchObject({ amountPaidMinor: 261, balanceDueMinor: 100, status: "PARTIALLY_PAID" });
    await reconcileInvoiceRefund(attempt.accountId, { ...refund, id: "re_finance_remaining", amountMinor: 261 });
    const reopened = await getInvoice(staff, draft.id);
    expect(reopened).toMatchObject({ amountPaidMinor: 0, balanceDueMinor: 361, status: "FINALISED" });
    expect(reopened.allocations[0].payment).toMatchObject({ refundedMinor: 361, status: "REFUNDED" });
  });
});
