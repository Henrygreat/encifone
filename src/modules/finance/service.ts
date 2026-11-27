import {
  BillingInterval,
  CreditNoteStatus,
  EstimateStatus,
  ExpenseStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RetainerStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";
import type { ActivePortalSession } from "@/modules/portal/auth";
import {
  addMonths,
  addQuarters,
  addYears,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { formatFinanceMoney } from "@/lib/finance-money";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError, ValidationError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type {
  AcceptEstimateInput,
  CreateCreditNoteInput,
  CreateEstimateInput,
  CreateExpenseInput,
  CreateInvoiceInput,
  CreateRetainerInput,
  CreateSubscriptionInput,
  FinanceForecastQuery,
  ListEstimatesQuery,
  ListExpensesQuery,
  ListInvoicesQuery,
  LogRetainerUsageInput,
  RecordPaymentInput,
  SubscriptionTransitionInput,
  UpdateEstimateInput,
  UpdateExpenseInput,
  UpdateInvoiceInput,
  UpdateRetainerInput,
  UpdateSubscriptionInput,
} from "./schemas";

interface FinanceLineInput {
  serviceItemId?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
}

const openInvoiceStatuses: InvoiceStatus[] = [
  InvoiceStatus.FINALISED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];
const issuedInvoiceStatuses = [...openInvoiceStatuses, InvoiceStatus.PAID];

const MAX_MINOR = 2_147_483_647;

function calcLine(line: FinanceLineInput) {
  const gross = line.quantity * line.unitPriceMinor;
  if (
    !Number.isSafeInteger(gross) ||
    gross > MAX_MINOR ||
    line.discountMinor > gross
  ) {
    throw new ValidationError(["Line amount or discount is out of range."]);
  }
  const net = gross - line.discountMinor;
  const tax = Math.floor((net * line.taxRateBps + 5000) / 10000);
  return {
    gross,
    net,
    tax,
    total: net + tax,
  };
}

function calcTotals(lines: FinanceLineInput[]) {
  const totals = lines.reduce(
    (acc, line) => {
      const computed = calcLine(line);
      acc.subtotalMinor += computed.gross;
      acc.taxMinor += computed.tax;
      acc.totalMinor += computed.total;
      acc.discountMinor += line.discountMinor;
      return acc;
    },
    { subtotalMinor: 0, taxMinor: 0, totalMinor: 0, discountMinor: 0 },
  );
  if (Object.values(totals).some((value) => value > MAX_MINOR)) {
    throw new ValidationError(["Document total exceeds the supported amount."]);
  }
  return totals;
}

type FinanceReferences = Partial<
  Record<
    | "clientId"
    | "companyId"
    | "contactId"
    | "projectId"
    | "opportunityId"
    | "serviceItemId"
    | "estimateId"
    | "subscriptionId"
    | "retainerId"
    | "timeEntryId"
    | "serviceRequestId",
    string
  >
> & { lines?: FinanceLineInput[] };

async function organisationCurrency(organisationId: string) {
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { defaultCurrency: true },
  });
  return organisation.defaultCurrency;
}

async function validateReferences(
  organisationId: string,
  input: FinanceReferences,
) {
  const scope = (id: string) => ({
    where: { id, organisationId },
    select: { id: true },
  });
  const services = new Set([
    input.serviceItemId,
    ...(input.lines ?? []).map((line) => line.serviceItemId),
  ]);
  services.delete(undefined);
  const results = await Promise.all([
    input.clientId && prisma.client.findFirst(scope(input.clientId)),
    input.companyId && prisma.company.findFirst(scope(input.companyId)),
    input.contactId && prisma.contact.findFirst(scope(input.contactId)),
    input.projectId && prisma.project.findFirst(scope(input.projectId)),
    input.opportunityId &&
      prisma.opportunity.findFirst(scope(input.opportunityId)),
    input.estimateId && prisma.estimate.findFirst(scope(input.estimateId)),
    input.subscriptionId &&
      prisma.subscription.findFirst(scope(input.subscriptionId)),
    input.retainerId && prisma.retainer.findFirst(scope(input.retainerId)),
    input.timeEntryId && prisma.timeEntry.findFirst(scope(input.timeEntryId)),
    input.serviceRequestId &&
      prisma.serviceRequest.findFirst(scope(input.serviceRequestId)),
    ...[...services].map((id) => prisma.serviceItem.findFirst(scope(id!))),
  ]);
  if (results.includes(null))
    throw new NotFoundError("A related finance record was not found.");
}

// Use the same lock for all finance mutations that read and change balances or schedules.
async function financeTransaction<T>(
  organisationId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR NO KEY UPDATE`;
    return operation(tx);
  });
}

function requireFinanceView(acting: ActiveMembership) {
  requireCapability(acting, Capability.FINANCE_VIEW);
}

function requireFinanceManage(acting: ActiveMembership) {
  requireCapability(acting, Capability.FINANCE_MANAGE);
}

function monthsPerInterval(interval: BillingInterval) {
  if (interval === BillingInterval.QUARTERLY) return 3;
  if (interval === BillingInterval.ANNUAL) return 12;
  return 1;
}

function nextByInterval(
  start: Date,
  interval: BillingInterval,
  intervalCount: number,
) {
  if (interval === BillingInterval.MONTHLY)
    return addMonths(start, intervalCount);
  if (interval === BillingInterval.QUARTERLY)
    return addQuarters(start, intervalCount);
  if (interval === BillingInterval.ANNUAL)
    return addYears(start, intervalCount);
  return addMonths(start, intervalCount);
}

export async function listEstimates(
  acting: ActiveMembership,
  query: ListEstimatesQuery,
) {
  requireFinanceView(acting);
  const where: Prisma.EstimateWhereInput = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.search
      ? { title: { contains: query.search, mode: "insensitive" } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.estimate.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { lines: { orderBy: { position: "asc" } } },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.estimate.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getEstimate(acting: ActiveMembership, id: string) {
  requireFinanceView(acting);
  const estimate = await prisma.estimate.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      versions: {
        include: { lines: { orderBy: { position: "asc" } } },
        orderBy: { versionNumber: "desc" },
      },
    },
  });
  if (!estimate) throw new NotFoundError("Estimate not found.");
  return estimate;
}

export async function createEstimate(
  acting: ActiveMembership,
  input: CreateEstimateInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const currency =
    input.currency ?? (await organisationCurrency(acting.organisationId));

  const totals = calcTotals(input.lines);

  const estimate = await financeTransaction(
    acting.organisationId,
    async (tx) => {
      const created = await tx.estimate.create({
        data: {
          organisationId: acting.organisationId,
          title: input.title,
          clientId: input.clientId,
          companyId: input.companyId,
          contactId: input.contactId,
          projectId: input.projectId,
          opportunityId: input.opportunityId,
          currency,
          validUntil: input.validUntil,
          expiresAt: input.expiresAt,
          createdByMembershipId: acting.membershipId,
        },
      });

      await tx.estimateVersion.create({
        data: {
          organisationId: acting.organisationId,
          estimateId: created.id,
          versionNumber: 1,
          ...totals,
          lines: {
            create: input.lines.map((line, index) => {
              const computed = calcLine(line);
              return {
                serviceItemId: line.serviceItemId,
                description: line.description,
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
                discountMinor: line.discountMinor,
                taxRateBps: line.taxRateBps,
                lineTotalMinor: computed.total,
                position: index,
              };
            }),
          },
          pricingSnapshot: {
            generatedAt: new Date().toISOString(),
            lines: input.lines,
          } as Prisma.InputJsonValue,
        },
      });

      await writeAuditLog(
        {
          organisationId: acting.organisationId,
          actorUserId: acting.userId,
          action: "estimate.created",
          resourceType: "Estimate",
          resourceId: created.id,
        },
        tx,
      );
      return created;
    },
  );

  return getEstimate(acting, estimate.id);
}

export async function updateEstimate(
  acting: ActiveMembership,
  id: string,
  input: UpdateEstimateInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);

  const { lines, ...rest } = input;
  if (rest.status && rest.status !== EstimateStatus.SENT)
    throw new ValidationError(["Use the estimate lifecycle actions."]);

  await financeTransaction(acting.organisationId, async (tx) => {
    await tx.estimate.update({
      where: {
        id,
        organisationId: acting.organisationId,
        status: EstimateStatus.DRAFT,
      },
      data: { ...rest, sentAt: rest.status ? new Date() : undefined },
    });

    if (lines && lines.length > 0) {
      const latest = await tx.estimateVersion.findFirst({
        where: { estimateId: id },
        orderBy: { versionNumber: "desc" },
      });
      const totals = calcTotals(lines);
      await tx.estimateVersion.create({
        data: {
          organisationId: acting.organisationId,
          estimateId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          ...totals,
          lines: {
            create: lines.map((line, index) => {
              const computed = calcLine(line);
              return {
                serviceItemId: line.serviceItemId,
                description: line.description,
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
                discountMinor: line.discountMinor,
                taxRateBps: line.taxRateBps,
                lineTotalMinor: computed.total,
                position: index,
              };
            }),
          },
          pricingSnapshot: {
            generatedAt: new Date().toISOString(),
            lines,
          } as Prisma.InputJsonValue,
        },
      });
    }
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "estimate.updated",
        resourceType: "Estimate",
        resourceId: id,
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );
  });

  return getEstimate(acting, id);
}

export async function duplicateEstimate(acting: ActiveMembership, id: string) {
  requireFinanceManage(acting);
  const estimate = await getEstimate(acting, id);
  const latest = estimate.versions[0];
  if (!latest) throw new NotFoundError("Estimate version not found.");

  return createEstimate(acting, {
    title: `${estimate.title} (Copy)`,
    clientId: estimate.clientId ?? undefined,
    companyId: estimate.companyId ?? undefined,
    contactId: estimate.contactId ?? undefined,
    projectId: estimate.projectId ?? undefined,
    opportunityId: estimate.opportunityId ?? undefined,
    currency: estimate.currency,
    validUntil: estimate.validUntil ?? undefined,
    expiresAt: estimate.expiresAt ?? undefined,
    lines: latest.lines.map((line) => ({
      serviceItemId: line.serviceItemId ?? undefined,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
    })),
  });
}

export async function archiveEstimate(acting: ActiveMembership, id: string) {
  requireFinanceManage(acting);
  return financeTransaction(acting.organisationId, async (tx) => {
    const where = { id, organisationId: acting.organisationId };
    const current = await tx.estimate.findFirst({ where });
    if (!current) throw new NotFoundError("Estimate not found.");
    if (current.status === EstimateStatus.ARCHIVED) return current;
    const estimate = await tx.estimate.update({
      where,
      data: { status: EstimateStatus.ARCHIVED, archivedAt: new Date() },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "estimate.archived",
        resourceType: "Estimate",
        resourceId: id,
      },
      tx,
    );

    return estimate;
  });
}

async function createInvoiceFromEstimateInternal(
  tx: Prisma.TransactionClient,
  acting: Pick<ActiveMembership, "organisationId"> & { membershipId?: string },
  estimateId: string,
  paymentTermsDays: number,
) {
  const estimate = await tx.estimate.findFirst({
    where: { id: estimateId, organisationId: acting.organisationId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { lines: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!estimate) throw new NotFoundError("Estimate not found.");
  if (estimate.acceptedInvoiceId) {
    return tx.invoice.findFirstOrThrow({
      where: {
        id: estimate.acceptedInvoiceId,
        organisationId: acting.organisationId,
      },
    });
  }

  const latest = estimate.versions[0];
  if (!latest) throw new NotFoundError("Estimate lines not found.");

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + paymentTermsDays);

  const invoice = await tx.invoice.create({
    data: {
      organisationId: acting.organisationId,
      estimateId: estimate.id,
      clientId: estimate.clientId,
      companyId: estimate.companyId,
      contactId: estimate.contactId,
      projectId: estimate.projectId,
      status: InvoiceStatus.DRAFT,
      type: InvoiceType.ONE_OFF,
      currency: estimate.currency,
      issueDate: new Date(),
      dueDate,
      paymentTermsDays,
      subtotalMinor: latest.subtotalMinor,
      discountMinor: latest.discountMinor,
      taxMinor: latest.taxMinor,
      totalMinor: latest.totalMinor,
      amountPaidMinor: 0,
      balanceDueMinor: latest.totalMinor,
      createdByMembershipId: acting.membershipId,
      lines: {
        create: latest.lines.map((line) => ({
          organisationId: acting.organisationId,
          serviceItemId: line.serviceItemId,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountMinor: line.discountMinor,
          taxRateBps: line.taxRateBps,
          lineTotalMinor: line.lineTotalMinor,
          position: line.position,
        })),
      },
    },
  });

  await tx.estimate.update({
    where: { id: estimate.id },
    data: { acceptedInvoiceId: invoice.id },
  });

  return invoice;
}

export async function acceptEstimate(
  acting: ActiveMembership,
  id: string,
  input: AcceptEstimateInput,
) {
  requireFinanceManage(acting);
  return acceptScopedEstimate(acting, id, input);
}

async function acceptScopedEstimate(
  acting: {
    organisationId: string;
    membershipId?: string;
    userId: string | null;
  },
  id: string,
  input: AcceptEstimateInput,
  portal?: ActivePortalSession,
) {
  return financeTransaction(acting.organisationId, async (tx) => {
    const where = {
      id,
      organisationId: acting.organisationId,
      ...(portal ? { clientId: portal.clientId } : {}),
    };
    const estimate = await tx.estimate.findFirst({ where });
    if (!estimate) throw new NotFoundError("Estimate not found.");
    const now = new Date();
    if (estimate.status === EstimateStatus.ACCEPTED) {
      return {
        updatedEstimate: estimate,
        invoiceId: estimate.acceptedInvoiceId,
      };
    }
    if (
      estimate.status !== EstimateStatus.SENT ||
      [estimate.expiresAt, estimate.validUntil].some(
        (date) => date && date < now,
      )
    ) {
      throw new ValidationError([
        "Only a current, sent estimate can be accepted.",
      ]);
    }
    const updatedEstimate = await tx.estimate.update({
      where,
      data: {
        status: EstimateStatus.ACCEPTED,
        acceptedAt: now,
        respondedAt: now,
      },
    });
    const invoice = input.autoCreateInvoice
      ? await createInvoiceFromEstimateInternal(
          tx,
          acting,
          id,
          input.paymentTermsDays,
        )
      : null;
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "estimate.accepted",
        resourceType: "Estimate",
        resourceId: id,
        metadata: {
          invoiceId: invoice?.id ?? null,
          portalUserId: portal?.portalUserId ?? null,
        },
      },
      tx,
    );
    return { updatedEstimate, invoiceId: invoice?.id ?? null };
  });
}

export async function listInvoices(
  acting: ActiveMembership,
  query: ListInvoicesQuery,
) {
  requireFinanceView(acting);
  const now = new Date();

  const where: Prisma.InvoiceWhereInput = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.overdueOnly
      ? {
          dueDate: { lt: now },
          balanceDueMinor: { gt: 0 },
          status: {
            in: [
              InvoiceStatus.FINALISED,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.OVERDUE,
            ],
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { internalNotes: { contains: query.search, mode: "insensitive" } },
            {
              invoiceNumber: Number.isFinite(Number(query.search))
                ? Number(query.search)
                : undefined,
            },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        lines: { orderBy: { position: "asc" } },
        allocations: {
          include: { payment: true },
          orderBy: { allocatedAt: "desc" },
        },
        creditNotes: { orderBy: { issuedAt: "desc" } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getInvoice(acting: ActiveMembership, id: string) {
  requireFinanceView(acting);
  const invoice = await prisma.invoice.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      lines: { orderBy: { position: "asc" } },
      allocations: {
        include: { payment: true },
        orderBy: { allocatedAt: "desc" },
      },
      creditNotes: { orderBy: { issuedAt: "desc" } },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  return invoice;
}

export async function createInvoice(
  acting: ActiveMembership,
  input: CreateInvoiceInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const currency =
    input.currency ?? (await organisationCurrency(acting.organisationId));

  const totals = calcTotals(input.lines);
  const issueDate = input.issueDate ?? new Date();
  const dueDate =
    input.dueDate ??
    new Date(issueDate.getTime() + input.paymentTermsDays * 86400000);

  if (input.estimateId || input.subscriptionId || input.retainerId) {
    throw new ValidationError([
      "Use the source workflow to generate this invoice.",
    ]);
  }
  if (input.timeEntryId && input.serviceRequestId)
    throw new ValidationError(["Choose one work source."]);
  const invoice = await financeTransaction(
    acting.organisationId,
    async (tx) => {
      const source = input.timeEntryId
        ? { timeEntryId: input.timeEntryId }
        : input.serviceRequestId
          ? { serviceRequestId: input.serviceRequestId }
          : { creationKey: input.creationKey };
      const previous = await tx.invoice.findFirst({
        where: { organisationId: acting.organisationId, ...source },
      });
      if (previous) return previous;

      let projectId = input.projectId;
      let clientId = input.clientId;
      if (input.timeEntryId) {
        const entry = await tx.timeEntry.findFirst({
          where: {
            id: input.timeEntryId,
            organisationId: acting.organisationId,
            isBillable: true,
            approvalStatus: "APPROVED",
          },
          include: {
            project: { select: { clientId: true, organisationId: true } },
          },
        });
        if (
          !entry?.projectId ||
          entry.project?.organisationId !== acting.organisationId ||
          !entry.project.clientId
        ) {
          throw new ValidationError([
            "Approved billable time must belong to a client project.",
          ]);
        }
        projectId = entry.projectId;
        clientId = entry.project.clientId;
      }
      if (input.serviceRequestId) {
        const request = await tx.serviceRequest.findFirst({
          where: {
            id: input.serviceRequestId,
            organisationId: acting.organisationId,
            status: { in: ["RESOLVED", "CLOSED"] },
            resolvedAt: { not: null },
          },
        });
        if (!request)
          throw new ValidationError(["Choose a resolved service request."]);
        projectId = request.projectId ?? undefined;
        clientId = request.clientId;
      }

      const created = await tx.invoice.create({
        data: {
          organisationId: acting.organisationId,
          timeEntryId: input.timeEntryId,
          serviceRequestId: input.serviceRequestId,
          creationKey: input.creationKey,
          clientId,
          companyId: input.companyId,
          contactId: input.contactId,
          projectId,
          currency,
          issueDate,
          dueDate,
          paymentTermsDays: input.paymentTermsDays,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          amountPaidMinor: 0,
          balanceDueMinor: totals.totalMinor,
          internalNotes: input.internalNotes,
          createdByMembershipId: acting.membershipId,
          lines: {
            create: input.lines.map((line, index) => {
              const computed = calcLine(line);
              return {
                organisationId: acting.organisationId,
                serviceItemId: line.serviceItemId,
                description: line.description,
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
                discountMinor: line.discountMinor,
                taxRateBps: line.taxRateBps,
                lineTotalMinor: computed.total,
                position: index,
              };
            }),
          },
        },
      });

      await writeAuditLog(
        {
          organisationId: acting.organisationId,
          actorUserId: acting.userId,
          action: "invoice.created",
          resourceType: "Invoice",
          resourceId: created.id,
          metadata: {
            timeEntryId: input.timeEntryId ?? null,
            serviceRequestId: input.serviceRequestId ?? null,
          },
        },
        tx,
      );
      return created;
    },
  );

  return getInvoice(acting, invoice.id);
}

export async function updateInvoice(
  acting: ActiveMembership,
  id: string,
  input: UpdateInvoiceInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const { lines, ...rest } = input;
  if (
    rest.status ||
    rest.estimateId ||
    rest.subscriptionId ||
    rest.retainerId ||
    rest.timeEntryId ||
    rest.serviceRequestId ||
    rest.creationKey
  )
    throw new ValidationError([
      "Use the invoice lifecycle and source actions.",
    ]);

  await financeTransaction(acting.organisationId, async (tx) => {
    const data: Prisma.InvoiceUpdateInput = { ...rest };
    const draft = await tx.invoice.findFirst({
      where: {
        id,
        organisationId: acting.organisationId,
        status: InvoiceStatus.DRAFT,
      },
    });
    if (!draft) throw new NotFoundError("Draft invoice not found.");
    if ((draft.estimateId || draft.subscriptionId || draft.retainerId || draft.timeEntryId || draft.serviceRequestId) && (rest.clientId || rest.projectId || rest.companyId || rest.contactId)) {
      throw new ValidationError(["A generated invoice retains the source customer and project."]);
    }

    if (lines) {
      const totals = calcTotals(lines);
      data.subtotalMinor = totals.subtotalMinor;
      data.discountMinor = totals.discountMinor;
      data.taxMinor = totals.taxMinor;
      data.totalMinor = totals.totalMinor;
      data.balanceDueMinor = totals.totalMinor;

      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({
        data: lines.map((line, index) => {
          const computed = calcLine(line);
          return {
            organisationId: acting.organisationId,
            invoiceId: id,
            serviceItemId: line.serviceItemId,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountMinor: line.discountMinor,
            taxRateBps: line.taxRateBps,
            lineTotalMinor: computed.total,
            position: index,
          };
        }),
      });
    }

    await tx.invoice.update({ where: { id }, data });
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "invoice.updated",
        resourceType: "Invoice",
        resourceId: id,
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );
  });

  return getInvoice(acting, id);
}

export async function finaliseInvoice(acting: ActiveMembership, id: string) {
  requireFinanceManage(acting);
  return financeTransaction(acting.organisationId, async (tx) => {
    const where = { id, organisationId: acting.organisationId };
    const existing = await tx.invoice.findFirst({ where });
    if (!existing || existing.status === InvoiceStatus.ARCHIVED)
      throw new NotFoundError("Invoice not found.");
    if (existing.status !== InvoiceStatus.DRAFT) return existing;

    const highest = await tx.invoice.aggregate({
      where: { organisationId: acting.organisationId },
      _max: { invoiceNumber: true },
    });
    const now = new Date();
    const invoice = await tx.invoice.update({
      where,
      data: {
        invoiceNumber: (highest._max.invoiceNumber ?? 0) + 1,
        status:
          existing.balanceDueMinor === 0
            ? InvoiceStatus.PAID
            : InvoiceStatus.FINALISED,
        finalisedAt: now,
        paidAt: existing.balanceDueMinor === 0 ? now : null,
      },
    });
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "invoice.finalised",
        resourceType: "Invoice",
        resourceId: id,
      },
      tx,
    );
    return invoice;
  });
}

export async function archiveInvoice(acting: ActiveMembership, id: string) {
  requireFinanceManage(acting);
  return financeTransaction(acting.organisationId, async (tx) => {
    const invoice = await tx.invoice.update({
      where: {
        id,
        organisationId: acting.organisationId,
        status: InvoiceStatus.DRAFT,
      },
      data: { status: InvoiceStatus.ARCHIVED, archivedAt: new Date() },
    });
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "invoice.archived",
        resourceType: "Invoice",
        resourceId: id,
      },
      tx,
    );
    return invoice;
  });
}

export async function recordInvoicePayment(
  acting: ActiveMembership,
  invoiceId: string,
  input: RecordPaymentInput,
) {
  requireFinanceManage(acting);

  return financeTransaction(acting.organisationId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, organisationId: acting.organisationId },
    });
    if (!invoice) throw new NotFoundError("Invoice not found.");
    if (invoice.currency !== input.currency)
      throw new Error("Payment currency must match invoice currency.");
    const reference = input.externalReference?.trim();
    if (!reference || input.method === "STRIPE" || !input.allocateToInvoice) {
      throw new ValidationError([
        "Provide a unique external reference for an allocated manual payment.",
      ]);
    }
    const key = createHash("sha256")
      .update(JSON.stringify([acting.organisationId, reference]))
      .digest("hex");
    const providerPaymentId = `manual-${key}`;
    const previous = await tx.payment.findUnique({
      where: { providerPaymentId },
      include: { allocations: true },
    });
    if (previous) {
      const allocation = previous.allocations.find(
        (item) => item.invoiceId === invoiceId,
      );
      if (
        !allocation ||
        previous.amountMinor !== input.amountMinor ||
        previous.currency !== input.currency ||
        previous.method !== input.method
      ) {
        throw new ValidationError(["Payment reference has already been used."]);
      }
      const { allocations: _allocations, ...payment } = previous;
      void _allocations;
      return { invoice, payment, allocatedMinor: allocation.amountMinor };
    }
    if (
      !openInvoiceStatuses.includes(invoice.status) ||
      input.amountMinor > invoice.balanceDueMinor
    ) {
      throw new ValidationError([
        "The payment must fit the outstanding balance of an issued invoice.",
      ]);
    }

    const payment = await tx.payment.create({
      data: {
        organisationId: acting.organisationId,
        companyId: invoice.companyId,
        contactId: invoice.contactId,
        provider: PaymentProvider.MANUAL,
        providerPaymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        method: input.method,
        externalReference: input.externalReference,
        receivedAt: input.receivedAt ?? new Date(),
        status: PaymentStatus.SUCCEEDED,
      },
    });

    let allocated = 0;
    if (input.allocateToInvoice) {
      allocated = Math.min(input.amountMinor, invoice.balanceDueMinor);
      if (allocated > 0) {
        await tx.invoicePaymentAllocation.create({
          data: {
            organisationId: acting.organisationId,
            invoiceId: invoice.id,
            paymentId: payment.id,
            amountMinor: allocated,
            allocatedByMembershipId: acting.membershipId,
          },
        });
      }
    }

    const amountPaidMinor = invoice.amountPaidMinor + allocated;
    const balanceDueMinor = invoice.balanceDueMinor - allocated;
    const nextStatus =
      balanceDueMinor === 0
        ? InvoiceStatus.PAID
        : amountPaidMinor > 0
          ? InvoiceStatus.PARTIALLY_PAID
          : invoice.status;

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidMinor,
        balanceDueMinor,
        status: nextStatus,
        paidAt: balanceDueMinor === 0 ? new Date() : null,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "invoice.payment_recorded",
        resourceType: "Invoice",
        resourceId: invoice.id,
        metadata: { paymentId: payment.id, allocated },
      },
      tx,
    );

    return { invoice: updatedInvoice, payment, allocatedMinor: allocated };
  });
}

export async function createCreditNote(
  acting: ActiveMembership,
  invoiceId: string,
  input: CreateCreditNoteInput,
) {
  requireFinanceManage(acting);

  return financeTransaction(acting.organisationId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, organisationId: acting.organisationId },
    });
    if (!invoice) throw new NotFoundError("Invoice not found.");
    if (
      !openInvoiceStatuses.includes(invoice.status) ||
      input.amountMinor > invoice.balanceDueMinor
    )
      throw new Error("Credit amount cannot exceed remaining balance.");

    const count = await tx.creditNote.count({
      where: { organisationId: acting.organisationId },
    });
    const number = `CN-${String(count + 1).padStart(6, "0")}`;

    const credit = await tx.creditNote.create({
      data: {
        organisationId: acting.organisationId,
        invoiceId,
        number,
        amountMinor: input.amountMinor,
        reason: input.reason,
        status: CreditNoteStatus.APPLIED,
        appliedAt: new Date(),
        createdByMembershipId: acting.membershipId,
      },
    });

    const balanceDueMinor = Math.max(
      0,
      invoice.balanceDueMinor - input.amountMinor,
    );
    const status = balanceDueMinor === 0 ? InvoiceStatus.PAID : invoice.status;

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        balanceDueMinor,
        status,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "invoice.credit_note_applied",
        resourceType: "CreditNote",
        resourceId: credit.id,
        metadata: { invoiceId, amountMinor: input.amountMinor },
      },
      tx,
    );

    return { credit, invoice: updatedInvoice };
  });
}

export async function listExpenses(
  acting: ActiveMembership,
  query: ListExpensesQuery,
) {
  requireFinanceView(acting);
  const where: Prisma.ExpenseWhereInput = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.billableOnly ? { isBillable: true } : {}),
    ...(query.search
      ? {
          OR: [
            { category: { contains: query.search, mode: "insensitive" } },
            { supplierName: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function createExpense(
  acting: ActiveMembership,
  input: CreateExpenseInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const currency = input.currency ?? await organisationCurrency(acting.organisationId);
  return financeTransaction(acting.organisationId, async (tx) => {

    const expense = await tx.expense.create({
      data: {
        organisationId: acting.organisationId,
        clientId: input.clientId,
        projectId: input.projectId,
        supplierName: input.supplierName,
        category: input.category,
        description: input.description,
        amountMinor: input.amountMinor,
        currency,
        expenseDate: input.expenseDate,
        receiptStorageKey: input.receiptStorageKey,
        status: ExpenseStatus.SUBMITTED,
        isBillable: input.isBillable ?? false,
        isRecurring: input.isRecurring ?? false,
        recurrenceDays: input.isRecurring ? input.recurrenceDays : null,
        nextOccurrenceAt:
          input.isRecurring && input.recurrenceDays
            ? new Date(
                input.expenseDate.getTime() + input.recurrenceDays * 86400000,
              )
            : null,
        submittedByMembershipId: acting.membershipId,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "expense.created",
        resourceType: "Expense",
        resourceId: expense.id,
      },
      tx,
    );

    return expense;
  });
}

export async function updateExpense(
  acting: ActiveMembership,
  id: string,
  input: UpdateExpenseInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  return financeTransaction(acting.organisationId, async (tx) => {
    const existing = await tx.expense.findFirst({
      where: { id, organisationId: acting.organisationId },
    });
    if (!existing) throw new NotFoundError("Expense not found.");
    const changesExpense = Object.keys(input).some((key) => key !== "status");
    if (changesExpense && existing.status !== ExpenseStatus.SUBMITTED) throw new ValidationError(["Only submitted expenses can be edited."]);
    if (input.status && input.status !== existing.status) {
      const valid = existing.status === ExpenseStatus.SUBMITTED && [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED].some((status) => status === input.status)
        || existing.status === ExpenseStatus.APPROVED && input.status === ExpenseStatus.REIMBURSED;
      if (!valid) throw new ValidationError(["Invalid expense status transition."]);
    }
    if (!changesExpense && input.status === existing.status) return existing;

    const expense = await tx.expense.update({
      where: { id },
      data: {
        ...input,
        approvedByMembershipId:
          input.status === ExpenseStatus.APPROVED
            ? acting.membershipId
            : undefined,
        approvedAt:
          input.status === ExpenseStatus.APPROVED
            ? new Date()
            : undefined,
        reimbursedAt:
          input.status === ExpenseStatus.REIMBURSED
            ? new Date()
            : undefined,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "expense.updated",
        resourceType: "Expense",
        resourceId: id,
        metadata: { from: existing.status, to: expense.status },
      },
      tx,
    );

    return expense;
  });
}

export async function listSubscriptions(acting: ActiveMembership) {
  requireFinanceView(acting);
  return prisma.subscription.findMany({
    where: { organisationId: acting.organisationId },
    include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSubscription(
  acting: ActiveMembership,
  input: CreateSubscriptionInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const currency = input.currency ?? await organisationCurrency(acting.organisationId);
  return financeTransaction(acting.organisationId, async (tx) => {

    const subscription = await tx.subscription.create({
      data: {
        organisationId: acting.organisationId,
        clientId: input.clientId,
        companyId: input.companyId,
        contactId: input.contactId,
        serviceItemId: input.serviceItemId,
        title: input.title,
        status: input.trialEndsAt
          ? SubscriptionStatus.TRIALING
          : SubscriptionStatus.ACTIVE,
        billingInterval: input.billingInterval,
        intervalCount: input.intervalCount,
        amountMinor: input.amountMinor,
        currency,
        startDate: input.startDate,
        endDate: input.endDate,
        trialEndsAt: input.trialEndsAt,
        nextBillingDate:
          input.nextBillingDate ??
          input.trialEndsAt ??
          nextByInterval(
            input.startDate,
            input.billingInterval,
            input.intervalCount,
          ),
        autoRenew: input.autoRenew ?? true,
        createdByMembershipId: acting.membershipId,
        events: {
          create: {
            organisationId: acting.organisationId,
            type: "SUBSCRIPTION_CREATED",
            metadata: {
              amountMinor: input.amountMinor,
              interval: input.billingInterval,
            } as Prisma.InputJsonValue,
            createdByMembershipId: acting.membershipId,
          },
        },
      },
      include: { events: true },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "subscription.created",
        resourceType: "Subscription",
        resourceId: subscription.id,
      },
      tx,
    );

    return subscription;
  });
}

export async function updateSubscription(
  acting: ActiveMembership,
  id: string,
  input: UpdateSubscriptionInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  return financeTransaction(acting.organisationId, async (tx) => {
    const existing = await tx.subscription.findFirst({
      where: { id, organisationId: acting.organisationId },
    });
    if (!existing) throw new NotFoundError("Subscription not found.");

    const subscription = await tx.subscription.update({
      where: { id },
      data: input,
    });

    await tx.subscriptionEvent.create({
      data: {
        organisationId: acting.organisationId,
        subscriptionId: id,
        type: "SUBSCRIPTION_UPDATED",
        metadata: { fields: Object.keys(input) } as Prisma.InputJsonValue,
        createdByMembershipId: acting.membershipId,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "subscription.updated",
        resourceType: "Subscription",
        resourceId: id,
        metadata: {
          fromStatus: existing.status,
          toStatus: subscription.status,
        },
      },
      tx,
    );

    return subscription;
  });
}

export async function transitionSubscription(
  acting: ActiveMembership,
  id: string,
  input: SubscriptionTransitionInput,
) {
  requireFinanceManage(acting);

  return financeTransaction(acting.organisationId, async (tx) => {
      const where = { id, organisationId: acting.organisationId };
      const existing = await tx.subscription.findFirst({ where });
      if (!existing) throw new NotFoundError("Subscription not found.");
      const active = existing.status === SubscriptionStatus.ACTIVE || existing.status === SubscriptionStatus.TRIALING;
      const now = new Date();
      const data: Prisma.SubscriptionUpdateInput = {};
      if (input.action === "PAUSE" && active) {
        data.status = SubscriptionStatus.PAUSED;
        data.pausedAt = now;
      } else if (input.action === "RESUME" && existing.status === SubscriptionStatus.PAUSED) {
        data.status = existing.trialEndsAt && existing.trialEndsAt > now ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
        data.pausedAt = null;
      } else if (input.action === "CANCEL" && (active || existing.status === SubscriptionStatus.PAUSED)) {
        data.status = SubscriptionStatus.CANCELED;
        data.canceledAt = now;
        data.nextBillingDate = null;
        data.autoRenew = false;
      } else if (active && input.amountMinor !== undefined && (
        (input.action === "UPGRADE" && input.amountMinor > existing.amountMinor) ||
        (input.action === "DOWNGRADE" && input.amountMinor < existing.amountMinor)
      )) {
        data.amountMinor = input.amountMinor;
      } else {
        throw new ValidationError(["Invalid subscription transition or amount."]);
      }
      const updated = await tx.subscription.update({ where, data });
      await tx.subscriptionEvent.create({
        data: {
          organisationId: acting.organisationId,
          subscriptionId: id,
          type: `SUBSCRIPTION_${input.action}`,
          notes: input.notes,
          createdByMembershipId: acting.membershipId,
        },
      });

      await writeAuditLog(
        {
          organisationId: acting.organisationId,
          actorUserId: acting.userId,
          action: "subscription.transitioned",
          resourceType: "Subscription",
          resourceId: id,
          metadata: { action: input.action, previousAmountMinor: existing.amountMinor, amountMinor: updated.amountMinor },
        },
        tx,
      );
      return updated;
  });
}

export async function listRetainers(acting: ActiveMembership) {
  requireFinanceView(acting);
  return prisma.retainer.findMany({
    where: { organisationId: acting.organisationId },
    include: { usages: { orderBy: { occurredAt: "desc" }, take: 50 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRetainer(
  acting: ActiveMembership,
  input: CreateRetainerInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  const currency = input.currency ?? await organisationCurrency(acting.organisationId);
  return financeTransaction(acting.organisationId, async (tx) => {

    const retainer = await tx.retainer.create({
      data: {
        organisationId: acting.organisationId,
        clientId: input.clientId,
        title: input.title,
        type: input.type,
        status: RetainerStatus.ACTIVE,
        currency,
        monthlyFeeMinor: input.monthlyFeeMinor,
        includedMinutes: input.includedMinutes,
        includedServices: input.includedServices as
          Prisma.InputJsonValue | undefined,
        overageRateMinor: input.overageRateMinor,
        startDate: input.startDate,
        endDate: input.endDate,
        nextRenewalAt: input.nextRenewalAt,
        periodStartAt: input.periodStartAt,
        periodEndAt: input.periodEndAt,
        createdByMembershipId: acting.membershipId,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "retainer.created",
        resourceType: "Retainer",
        resourceId: retainer.id,
      },
      tx,
    );

    return retainer;
  });
}

export async function updateRetainer(
  acting: ActiveMembership,
  id: string,
  input: UpdateRetainerInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);
  return financeTransaction(acting.organisationId, async (tx) => {
    const retainer = await tx.retainer.findFirst({
      where: { id, organisationId: acting.organisationId },
    });
    if (!retainer) throw new NotFoundError("Retainer not found.");

    const updated = await tx.retainer.update({
      where: { id },
      data: {
        ...input,
        includedServices: input.includedServices as
          Prisma.InputJsonValue | undefined,
      },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "retainer.updated",
        resourceType: "Retainer",
        resourceId: id,
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );

    return updated;
  });
}

export async function logRetainerUsage(
  acting: ActiveMembership,
  retainerId: string,
  input: LogRetainerUsageInput,
) {
  requireFinanceManage(acting);
  await validateReferences(acting.organisationId, input);

  return financeTransaction(acting.organisationId, async (tx) => {
    const retainer = await tx.retainer.findFirst({
      where: { id: retainerId, organisationId: acting.organisationId },
    });
    if (!retainer) throw new NotFoundError("Retainer not found.");

    const now = new Date();
    if (retainer.status !== RetainerStatus.ACTIVE || retainer.startDate > now || (retainer.endDate && retainer.endDate < now)) {
      throw new ValidationError(["Usage requires an active retainer."]);
    }
    if (input.timeEntryId || input.serviceRequestId) {
      const previous = await tx.retainerUsage.findFirst({ where: {
        organisationId: acting.organisationId, retainerId,
        OR: [
          ...(input.timeEntryId ? [{ timeEntryId: input.timeEntryId }] : []),
          ...(input.serviceRequestId ? [{ serviceRequestId: input.serviceRequestId }] : []),
        ],
      } });
      if (previous) return { usage: previous, retainer };
    }
    if (retainer.nextRenewalAt && retainer.nextRenewalAt <= now) throw new ValidationError(["Renew this retainer before logging usage for a new period."]);
    const nextUsed = retainer.usedMinutes + input.minutesUsed;
    const included = retainer.includedMinutes ?? 0;
    const overMinutes =
      Math.max(0, nextUsed - included) -
      Math.max(0, retainer.usedMinutes - included);
    const overageMinor = (retainer.overageRateMinor ?? 0) * overMinutes;

    if (nextUsed > MAX_MINOR || !Number.isSafeInteger(overageMinor) || overageMinor > MAX_MINOR) {
      throw new ValidationError(["Usage exceeds the supported amount."]);
    }
    const usage = await tx.retainerUsage.create({
      data: {
        organisationId: acting.organisationId,
        retainerId,
        timeEntryId: input.timeEntryId,
        serviceRequestId: input.serviceRequestId,
        minutesUsed: input.minutesUsed,
        overageMinor,
        note: input.note,
      },
    });

    const updatedRetainer = await tx.retainer.update({
      where: { id: retainerId },
      data: { usedMinutes: nextUsed },
    });

    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "retainer.usage_logged",
        resourceType: "RetainerUsage",
        resourceId: usage.id,
        metadata: { retainerId, overageMinor },
      },
      tx,
    );

    return { usage, retainer: updatedRetainer };
  });
}

export async function listFinancialAudit(acting: ActiveMembership) {
  requireFinanceView(acting);
  return prisma.auditLog.findMany({
    where: {
      organisationId: acting.organisationId,
      resourceType: { in: ["Estimate", "Invoice", "CreditNote", "Expense", "Subscription", "Retainer", "RetainerUsage"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, action: true, resourceType: true, resourceId: true, actorUserId: true, createdAt: true },
  });
}

export async function getFinancialMetrics(acting: ActiveMembership) {
  requireFinanceView(acting);
  const now = new Date();
  const currency = await organisationCurrency(acting.organisationId);
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [
    invoices,
    currentMonthInvoices,
    payments,
    expenses,
    subscriptions,
    retainers,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: { in: issuedInvoiceStatuses },
      },
    }),
    prisma.invoice.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        issueDate: { gte: start, lte: end },
        status: { in: issuedInvoiceStatuses },
      },
    }),
    prisma.payment.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.expense.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.REIMBURSED] },
      },
    }),
    prisma.subscription.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
    }),
    prisma.retainer.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: RetainerStatus.ACTIVE,
      },
    }),
  ]);

  const netInvoiced = (invoice: { amountPaidMinor: number; balanceDueMinor: number }) => invoice.amountPaidMinor + invoice.balanceDueMinor;
  const totalInvoicedRevenueMinor = invoices.reduce((sum, invoice) => sum + netInvoiced(invoice), 0);
  const collectedRevenueMinor = payments.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const outstandingReceivablesMinor = invoices.reduce(
    (sum, item) => sum + item.balanceDueMinor,
    0,
  );
  const overdueReceivablesMinor = invoices
    .filter(
      (item) => item.dueDate && item.dueDate < now && item.balanceDueMinor > 0,
    )
    .reduce((sum, item) => sum + item.balanceDueMinor, 0);
  const operatingExpensesMinor = expenses.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const grossProfitMinor = collectedRevenueMinor - operatingExpensesMinor;
  const grossMargin =
    collectedRevenueMinor > 0 ? grossProfitMinor / collectedRevenueMinor : null;

  const monthly = subscriptions
    .filter(
      (item) =>
        item.status === SubscriptionStatus.ACTIVE &&
        item.startDate <= now &&
        (!item.endDate || item.endDate >= now),
    )
    .reduce(
      (sum, item) =>
        sum.plus(
          new Prisma.Decimal(item.amountMinor).dividedBy(
            monthsPerInterval(item.billingInterval) * item.intervalCount,
          ),
        ),
      new Prisma.Decimal(0),
    );
  const totalMrrMinor = monthly.toDecimalPlaces(0).toNumber();
  const arrMinor = monthly.times(12).toDecimalPlaces(0).toNumber();

  const recurringRetainerMinor = retainers.reduce(
    (sum, item) => sum + (item.monthlyFeeMinor ?? 0),
    0,
  );

  const thisMonthInvoicedMinor = currentMonthInvoices.reduce(
    (sum, item) => sum + netInvoiced(item),
    0,
  );

  const invoiceCount = invoices.length;
  const payingClientIds = new Set(
    invoices.map((item) => item.clientId).filter(Boolean),
  );
  const averageRevenuePerClientMinor =
    payingClientIds.size > 0
      ? Math.round(totalInvoicedRevenueMinor / payingClientIds.size)
      : 0;

  const receivableAgeing = {
    currentMinor: invoices
      .filter((item) => !item.dueDate || item.dueDate >= now)
      .reduce((sum, item) => sum + item.balanceDueMinor, 0),
    d1to30Minor: invoices
      .filter(
        (item) =>
          item.dueDate &&
          item.dueDate < now &&
          daysBetween(item.dueDate, now) <= 30,
      )
      .reduce((sum, item) => sum + item.balanceDueMinor, 0),
    d31to60Minor: invoices
      .filter(
        (item) =>
          item.dueDate &&
          daysBetween(item.dueDate, now) > 30 &&
          daysBetween(item.dueDate, now) <= 60,
      )
      .reduce((sum, item) => sum + item.balanceDueMinor, 0),
    d61plusMinor: invoices
      .filter((item) => item.dueDate && daysBetween(item.dueDate, now) > 60)
      .reduce((sum, item) => sum + item.balanceDueMinor, 0),
  };

  return {
    currency,
    mrrMinor: totalMrrMinor,
    arrMinor,
    totalInvoicedRevenueMinor,
    collectedRevenueMinor,
    outstandingReceivablesMinor,
    overdueReceivablesMinor,
    operatingExpensesMinor,
    grossProfitMinor,
    grossMargin,
    recurringRetainerMinor,
    thisMonthInvoicedMinor,
    invoiceCount,
    averageRevenuePerClientMinor,
    receivableAgeing,
  };
}

function daysBetween(dateA: Date, dateB: Date) {
  const diff = dateB.getTime() - dateA.getTime();
  return Math.floor(diff / 86400000);
}

export async function getFinancialForecast(
  acting: ActiveMembership,
  query: FinanceForecastQuery,
) {
  requireFinanceView(acting);
  const now = new Date();
  const { defaultCurrency: currency } =
    await prisma.organisation.findUniqueOrThrow({
      where: { id: acting.organisationId },
      select: { defaultCurrency: true },
    });

  const [subscriptions, invoices, expenses] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        status: {
          in: [
            InvoiceStatus.FINALISED,
            InvoiceStatus.PARTIALLY_PAID,
            InvoiceStatus.OVERDUE,
          ],
        },
        balanceDueMinor: { gt: 0 },
      },
    }),
    prisma.expense.findMany({
      where: {
        organisationId: acting.organisationId,
        currency,
        isRecurring: true,
        status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.REIMBURSED] },
      },
    }),
  ]);

  const periods = Array.from({ length: query.months }, (_, i) => {
    const periodStart = startOfMonth(addMonths(now, i));
    const periodEnd = endOfMonth(periodStart);

    const contractedRecurringMinor = subscriptions.reduce((sum, sub) => {
      let due = sub.nextBillingDate;
      let total = 0;
      while (due && due <= periodEnd && (!sub.endDate || due <= sub.endDate)) {
        if (due >= periodStart && (!sub.trialEndsAt || due >= sub.trialEndsAt))
          total += sub.amountMinor;
        if (!sub.autoRenew) break;
        due = nextByInterval(due, sub.billingInterval, sub.intervalCount);
      }
      return sum + total;
    }, 0);
    const dueMinor = invoices
      .filter(
        (invoice) =>
          invoice.dueDate &&
          invoice.dueDate <= periodEnd &&
          (i === 0 || invoice.dueDate >= periodStart),
      )
      .reduce((sum, invoice) => sum + invoice.balanceDueMinor, 0);
    const expectedCollectionsMinor = new Prisma.Decimal(dueMinor)
      .times("0.8")
      .toDecimalPlaces(0)
      .toNumber();
    const forecastExpensesMinor = expenses.reduce((sum, expense) => {
      if (!expense.nextOccurrenceAt || !expense.recurrenceDays) return sum;
      const step = expense.recurrenceDays * 86_400_000;
      const first = expense.nextOccurrenceAt.getTime();
      const startIndex = Math.max(
        0,
        Math.ceil((periodStart.getTime() - first) / step),
      );
      const endIndex = Math.floor((periodEnd.getTime() - first) / step);
      return sum + Math.max(0, endIndex - startIndex + 1) * expense.amountMinor;
    }, 0);
    const expectedRevenueMinor =
      contractedRecurringMinor + expectedCollectionsMinor;

    return {
      month: periodStart.toISOString().slice(0, 7),
      contractedRecurringMinor,
      expectedCollectionsMinor,
      expectedRevenueMinor,
      forecastExpensesMinor,
      projectedCashFlowMinor: expectedRevenueMinor - forecastExpensesMinor,
      bestCaseMinor: new Prisma.Decimal(expectedRevenueMinor)
        .times("1.15")
        .toDecimalPlaces(0)
        .toNumber(),
      expectedCaseMinor: expectedRevenueMinor,
      worstCaseMinor: new Prisma.Decimal(expectedRevenueMinor)
        .times("0.75")
        .toDecimalPlaces(0)
        .toNumber(),
    };
  });

  return {
    currency,
    methodology: {
      expectedCollectionsRate: 0.8,
      bestCaseMultiplier: 1.15,
      worstCaseMultiplier: 0.75,
      notes:
        "Expected collections are based on outstanding due invoices; recurring revenue uses subscription next billing dates.",
    },
    periods,
  };
}

export async function runRecurringBilling(
  acting: ActiveMembership,
  runAt = new Date(),
) {
  requireFinanceManage(acting);
  return generateDueInvoices(acting, runAt);
}

export async function runScheduledRecurringBilling(runAt = new Date()) {
  const [subscriptions, retainers] = await Promise.all([
    prisma.subscription.findMany({
      where: { nextBillingDate: { lte: runAt }, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
      distinct: ["organisationId"], select: { organisationId: true },
    }),
    prisma.retainer.findMany({
      where: { nextRenewalAt: { lte: runAt }, status: RetainerStatus.ACTIVE },
      distinct: ["organisationId"], select: { organisationId: true },
    }),
  ]);
  const organisations = new Set([...subscriptions, ...retainers].map((record) => record.organisationId));
  const results = await Promise.allSettled(
    [...organisations].map((organisationId) =>
      generateDueInvoices({ organisationId, userId: null }, runAt),
    ),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new Error("Recurring billing failed for one or more organisations.");
}

type BillingActor = { organisationId: string; userId: string | null; membershipId?: string };

async function generateDueInvoices(
  acting: BillingActor,
  runAt: Date,
) {
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      organisationId: acting.organisationId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      nextBillingDate: { lte: runAt },
    },
  });

  const createdInvoices: string[] = [];

  for (const candidate of dueSubscriptions) {
    const id = await financeTransaction(acting.organisationId, async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: {
          id: candidate.id,
          organisationId: acting.organisationId,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          nextBillingDate: { lte: runAt },
        },
      });
      if (
        !sub?.nextBillingDate ||
        sub.nextBillingDate > runAt ||
        (sub.endDate && sub.nextBillingDate > sub.endDate) ||
        (sub.trialEndsAt && sub.trialEndsAt > runAt)
      )
        return null;
      const issueDate = sub.nextBillingDate;
        const creationKey = `subscription:${sub.id}:${issueDate.toISOString()}`;
      const dueDate = new Date(issueDate.getTime() + 30 * 86400000);

      const previous = await tx.invoice.findFirst({ where: { organisationId: acting.organisationId, creationKey } });
      const invoice = previous ?? await tx.invoice.create({
        data: {
          organisationId: acting.organisationId,
          creationKey,
          subscriptionId: sub.id,
          clientId: sub.clientId,
          companyId: sub.companyId,
          contactId: sub.contactId,
          status: InvoiceStatus.DRAFT,
          type: InvoiceType.RECURRING,
          currency: sub.currency,
          issueDate,
          dueDate,
          paymentTermsDays: 30,
          subtotalMinor: sub.amountMinor,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: sub.amountMinor,
          balanceDueMinor: sub.amountMinor,
          createdByMembershipId: acting.membershipId,
          lines: {
            create: [
              {
                organisationId: acting.organisationId,
                serviceItemId: sub.serviceItemId,
                description: `${sub.title} (${sub.billingInterval})`,
                quantity: 1,
                unitPriceMinor: sub.amountMinor,
                discountMinor: 0,
                taxRateBps: 0,
                lineTotalMinor: sub.amountMinor,
                position: 0,
              },
            ],
          },
        },
      });

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          nextBillingDate: sub.autoRenew
            ? nextByInterval(issueDate, sub.billingInterval, sub.intervalCount)
            : null,
          status: sub.autoRenew
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.CANCELED,
        },
      });

      if (previous) return null;
      await tx.subscriptionEvent.create({
        data: {
          organisationId: acting.organisationId,
          subscriptionId: sub.id,
          type: "INVOICE_GENERATED",
          metadata: { invoiceId: invoice.id } as Prisma.InputJsonValue,
          createdByMembershipId: acting.membershipId,
        },
      });

      await writeAuditLog(
        {
          organisationId: acting.organisationId,
          actorUserId: acting.userId,
          action: "invoice.recurring_created",
          resourceType: "Invoice",
          resourceId: invoice.id,
        },
        tx,
      );
      return invoice.id;
    });
    if (id) createdInvoices.push(id);
  }

  createdInvoices.push(...await renewDueRetainers(acting, runAt));
  return { createdInvoiceIds: createdInvoices };
}

async function renewDueRetainers(acting: BillingActor, runAt: Date) {
  const { organisationId } = acting;
  const eligible = { organisationId, status: RetainerStatus.ACTIVE, nextRenewalAt: { lte: runAt } };
  const due = await prisma.retainer.findMany({ where: eligible, select: { id: true } });
  const ids: string[] = [];
  for (const { id } of due) {
    const invoiceId = await financeTransaction(organisationId, async (tx) => {
      const retainer = await tx.retainer.findFirst({ where: { ...eligible, id } });
      if (!retainer?.nextRenewalAt) return null;
      const issueDate = retainer.nextRenewalAt;
      if (retainer.endDate && issueDate > retainer.endDate) {
        await tx.retainer.update({ where: { id }, data: { status: RetainerStatus.EXPIRED, nextRenewalAt: null } });
        await writeAuditLog({ organisationId, actorUserId: acting.userId, action: "retainer.expired", resourceType: "Retainer", resourceId: id }, tx);
        return null;
      }
      const nextRenewalAt = addMonths(issueDate, 1);
      const usage = await tx.retainerUsage.aggregate({
        where: { organisationId, retainerId: id, occurredAt: { gte: retainer.periodStartAt ?? retainer.startDate, lt: issueDate } },
        _sum: { overageMinor: true },
      });
      const fee = retainer.monthlyFeeMinor ?? 0;
      const overage = usage._sum.overageMinor ?? 0;
      const lines = [{ description: retainer.title, price: fee }, { description: "Prior period overage", price: overage }].filter((line) => line.price > 0);
      const totalMinor = fee + overage;
      if (totalMinor > MAX_MINOR) throw new ValidationError(["Retainer renewal exceeds the supported amount."]);
      const creationKey = `retainer:${id}:${issueDate.toISOString()}`;
      const previous = totalMinor ? await tx.invoice.findFirst({ where: { organisationId, creationKey } }) : null;
      const invoice = !previous && totalMinor ? await tx.invoice.create({
        data: {
          organisationId, retainerId: id, creationKey, type: InvoiceType.RECURRING, clientId: retainer.clientId,
          currency: retainer.currency, issueDate, dueDate: new Date(issueDate.getTime() + 30 * 86400000),
          subtotalMinor: totalMinor, totalMinor, balanceDueMinor: totalMinor, createdByMembershipId: acting.membershipId,
          lines: { create: lines.map(({ description, price }, position) => ({
            organisationId, description, quantity: 1, unitPriceMinor: price, lineTotalMinor: price, position,
          })) },
        },
      }) : null;
      await tx.retainer.update({ where: { id }, data: {
        nextRenewalAt, periodStartAt: issueDate, periodEndAt: nextRenewalAt, usedMinutes: 0,
      } });
      if (!previous) await writeAuditLog({
        organisationId, actorUserId: acting.userId, action: "retainer.renewed", resourceType: "Retainer", resourceId: id,
        metadata: { invoiceId: invoice?.id ?? null, overageMinor: overage },
      }, tx);
      return invoice?.id ?? null;
    });
    if (invoiceId) ids.push(invoiceId);
  }
  return ids;
}

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(lines: string[]) {
  const wrapped = lines.flatMap((line) => {
    const safe = line.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
    return safe.match(/.{1,86}/g) ?? [""];
  });
  const pages = Array.from({ length: Math.ceil(wrapped.length / 49) }, (_, index) => wrapped.slice(index * 49, index * 49 + 49));
  const children = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${children}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const text = page.map((line) => `(${escapePdfText(line)}) Tj`).join("\nT*\n");
      const stream = `BT\n/F1 11 Tf\n48 744 Td\n14 TL\n${text}\nET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body);
}

export async function generateInvoicePdf(
  acting: ActiveMembership,
  invoiceId: string,
) {
  requireFinanceView(acting);
  const invoice = await getInvoice(acting, invoiceId);
  return renderInvoicePdf(invoice);
}

function renderInvoicePdf(
  invoice: Prisma.InvoiceGetPayload<{ select: typeof portalInvoice }>,
) {
  const money = (minor: number) => formatFinanceMoney(minor, invoice.currency, { locale: "en", currencyDisplay: "code" });
  const lines = [
    `Invoice #${invoice.invoiceNumber ?? "DRAFT"}`,
    `Status: ${invoice.status}`,
    `Currency: ${invoice.currency}`,
    `Issue date: ${invoice.issueDate ? invoice.issueDate.toISOString().slice(0, 10) : "-"}`,
    `Due date: ${invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "-"}`,
    "",
    ...invoice.lines.map(
      (line) =>
        `${line.description} | qty ${line.quantity} | unit ${money(line.unitPriceMinor)} | total ${money(line.lineTotalMinor)}`,
    ),
    "",
    `Subtotal: ${money(invoice.subtotalMinor)}`,
    `Discount: ${money(invoice.discountMinor)}`,
    `Tax: ${money(invoice.taxMinor)}`,
    `Total: ${money(invoice.totalMinor)}`,
    `Paid: ${money(invoice.amountPaidMinor)}`,
    `Credits applied: ${money((invoice.totalMinor - invoice.amountPaidMinor - invoice.balanceDueMinor))}`,
    `Balance due: ${money(invoice.balanceDueMinor)}`,
  ];

  return buildSimplePdf(lines);
}

const portalLine = {
  description: true,
  quantity: true,
  unitPriceMinor: true,
  discountMinor: true,
  taxRateBps: true,
  lineTotalMinor: true,
} as const;
const portalInvoice = {
  id: true,
  invoiceNumber: true,
  status: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  totalMinor: true,
  amountPaidMinor: true,
  balanceDueMinor: true,
  lines: { orderBy: { position: "asc" }, select: portalLine },
} satisfies Prisma.InvoiceSelect;

export async function listPortalEstimates(
  organisationId: string,
  clientId: string,
) {
  return prisma.estimate.findMany({
    where: {
      organisationId,
      clientId,
      status: {
        in: [
          EstimateStatus.SENT,
          EstimateStatus.ACCEPTED,
          EstimateStatus.REJECTED,
          EstimateStatus.EXPIRED,
        ],
      },
    },
    select: {
      id: true,
      title: true,
      status: true,
      currency: true,
      validUntil: true,
      expiresAt: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          totalMinor: true,
          lines: { orderBy: { position: "asc" }, select: portalLine },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function acceptPortalEstimate(
  session: ActivePortalSession,
  estimateId: string,
) {
  const result = await acceptScopedEstimate(
    { organisationId: session.organisationId, userId: null },
    estimateId,
    { autoCreateInvoice: true, paymentTermsDays: 30 },
    session,
  );
  return {
    id: result.updatedEstimate.id,
    status: result.updatedEstimate.status,
  };
}

export async function listPortalInvoices(
  organisationId: string,
  clientId: string,
) {
  return prisma.invoice.findMany({
    where: { organisationId, clientId, status: { in: issuedInvoiceStatuses } },
    select: portalInvoice,
    orderBy: { createdAt: "desc" },
  });
}

export async function generatePortalInvoicePdf(
  session: ActivePortalSession,
  id: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      organisationId: session.organisationId,
      clientId: session.clientId,
      status: { in: issuedInvoiceStatuses },
    },
    select: portalInvoice,
  });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  return renderInvoicePdf(invoice);
}

export async function getPortalSubscriptions(
  organisationId: string,
  clientId: string,
) {
  return prisma.subscription.findMany({
    where: { organisationId, clientId },
    select: {
      id: true,
      title: true,
      status: true,
      amountMinor: true,
      currency: true,
      billingInterval: true,
      intervalCount: true,
      nextBillingDate: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPortalRetainers(
  organisationId: string,
  clientId: string,
) {
  return prisma.retainer.findMany({
    where: { organisationId, clientId },
    select: {
      id: true,
      title: true,
      status: true,
      currency: true,
      monthlyFeeMinor: true,
      includedMinutes: true,
      usedMinutes: true,
      nextRenewalAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
