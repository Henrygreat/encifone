import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { writeAuditLog } from "@/core/audit";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import {
  documentTemplates,
  renderFinancialDocument,
  type DocumentLine,
} from "./document-renderer";

export const financialDocumentSettingsSchema = z.object({
  template: z.enum(documentTemplates).default("modern"),
  estimateTemplate: z.enum(documentTemplates).optional(),
  receiptTemplate: z.enum(documentTemplates).optional(),
  creditNoteTemplate: z.enum(documentTemplates).optional(),
  payOnline: z.boolean().optional(),
  paymentQr: z.boolean().optional(),
  legalName: z.string().trim().max(180).optional(),
  address: z.string().trim().max(360).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  telephone: z.string().trim().max(60).optional(),
  website: z.string().trim().max(180).optional(),
  registration: z.string().trim().max(80).optional(),
  taxRegistration: z.string().trim().max(80).optional(),
  prefix: z
    .string()
    .trim()
    .max(16)
    .regex(/^[a-zA-Z0-9-]*$/)
    .optional(),
  sequenceStart: z.number().int().min(1).max(2_147_483_647).optional(),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  primary: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .optional(),
  secondary: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .optional(),
  font: z.enum(["sans", "serif"]).optional(),
  notes: z.string().trim().max(900).optional(),
  paymentInstructions: z.string().trim().max(900).optional(),
  footer: z.string().trim().max(200).optional(),
  logoBase64: z.string().max(750_000).optional(),
});

export type FinancialDocumentSettings = z.infer<
  typeof financialDocumentSettingsSchema
>;
const settings = (value: unknown) => {
  const parsed = financialDocumentSettingsSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : financialDocumentSettingsSchema.parse({});
};

export async function organisationDefaultPaymentTerms(organisationId: string) {
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { financialDocumentSettings: true },
  });
  return settings(org.financialDocumentSettings).defaultPaymentTermsDays ?? 30;
}

export async function getFinancialDocumentSettings(acting: ActiveMembership) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: acting.organisationId },
    select: { name: true, financialDocumentSettings: true },
  });
  return {
    organisationName: org.name,
    settings: settings(org.financialDocumentSettings),
  };
}

export async function saveFinancialDocumentSettings(
  acting: ActiveMembership,
  input: FinancialDocumentSettings,
) {
  requireCapability(acting, Capability.ORG_UPDATE_SETTINGS);
  return prisma.$transaction(async (tx) => {
    await tx.organisation.update({
      where: { id: acting.organisationId },
      data: {
        financialDocumentSettings: JSON.parse(
          JSON.stringify(input),
        ) as Prisma.InputJsonValue,
      },
    });
    await writeAuditLog(
      {
        organisationId: acting.organisationId,
        actorUserId: acting.userId,
        action: "finance.document_settings_updated",
        resourceType: "Organisation",
        resourceId: acting.organisationId,
      },
      tx,
    );
  });
}

const snapshotSchema = z.object({
  version: z.literal(1),
  settings: financialDocumentSettingsSchema,
  sellerName: z.string(),
  customer: z.array(z.string()),
  billingEmail: z.email().optional(),
});
type Snapshot = z.infer<typeof snapshotSchema>;

interface InvoiceParties {
  organisationId: string;
  clientId: string | null;
  companyId: string | null;
  contactId: string | null;
}

function addressText(value: Prisma.JsonValue | undefined) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return [
    "line1",
    "line2",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "state",
    "postalCode",
    "postcode",
    "country",
  ]
    .map((key) => value[key])
    .filter(
      (part): part is string =>
        typeof part === "string" && Boolean(part.trim()),
    )
    .join(", ");
}

function contactValue(
  values: Prisma.JsonValue | undefined,
  key: "address" | "number",
) {
  if (!Array.isArray(values)) return undefined;
  const entries = values.filter(
    (value): value is Prisma.JsonObject =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
  const contact =
    entries.find((entry) => entry.isPrimary === true) ?? entries[0];
  return typeof contact?.[key] === "string" ? contact[key] : undefined;
}

export async function snapshotInvoiceDocument(
  db: Prisma.TransactionClient,
  invoice: InvoiceParties,
): Promise<Snapshot> {
  const { organisationId } = invoice;
  const org = await db.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { name: true, financialDocumentSettings: true },
  });
  const client = invoice.clientId
    ? await db.client.findFirst({
        where: { id: invoice.clientId, organisationId },
        select: { name: true, companyId: true, primaryContactId: true },
      })
    : null;
  const companyId = invoice.companyId ?? client?.companyId;
  const contactId = invoice.contactId ?? client?.primaryContactId;
  const [company, contact] = await Promise.all([
    companyId
      ? db.company.findFirst({
          where: { id: companyId, organisationId },
          select: {
            name: true,
            billingAddress: true,
            email: true,
            phone: true,
          },
        })
      : null,
    contactId
      ? db.contact.findFirst({
          where: { id: contactId, organisationId },
          select: {
            firstName: true,
            lastName: true,
            emails: true,
            phones: true,
          },
        })
      : null,
  ]);
  const billingEmail = [company?.email, contactValue(contact?.emails, "address")].find(
    (value): value is string => typeof value === "string" && z.email().safeParse(value).success,
  );
  return {
    version: 1,
    settings: settings(org.financialDocumentSettings),
    sellerName: org.name,
    ...(billingEmail ? { billingEmail } : {}),
    customer: [
      ...new Set(
        [
          company?.name ?? client?.name,
          contact && `${contact.firstName} ${contact.lastName}`,
          addressText(company?.billingAddress),
          billingEmail,
          company?.phone ?? contactValue(contact?.phones, "number"),
        ].filter((value): value is string => Boolean(value)),
      ),
    ].map((part) => part.slice(0, 300)),
  };
}

interface InvoiceDocumentSource {
  purchaseOrderReference?: string | null;
  customerReference?: string | null;
  documentSnapshot: Prisma.JsonValue;
  invoiceNumber: number | null;
  status: string;
  currency: string;
  issueDate: Date | null;
  dueDate: Date | null;
  paymentTermsDays: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  lines: DocumentLine[];
}

export async function invoiceDocumentData(
  invoice: InvoiceDocumentSource,
  parties: InvoiceParties,
) {
  const parsed = snapshotSchema.safeParse(invoice.documentSnapshot);
  const data = parsed.success
    ? parsed.data
    : await snapshotInvoiceDocument(prisma, parties);
  const config = data.settings;
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(value);
  const credits = Math.max(
    0,
    invoice.totalMinor - invoice.amountPaidMinor - invoice.balanceDueMinor,
  );
  return {
    ...config,
    logo: config.logoBase64
      ? Buffer.from(config.logoBase64, "base64")
      : undefined,
    title: "Invoice",
    reference:
      invoice.invoiceNumber === null
        ? undefined
        : `${config.prefix ?? ""}${invoice.invoiceNumber}`,
    status: invoice.status.replaceAll("_", " "),
    draft: invoice.invoiceNumber === null,
    currency: invoice.currency,
    seller: [
      config.legalName || data.sellerName,
      config.address ?? "",
      config.email ?? "",
      config.telephone ?? "",
      config.website ?? "",
      config.registration ? `Company registration: ${config.registration}` : "",
      config.taxRegistration
        ? `Tax registration: ${config.taxRegistration}`
        : "",
    ],
    customer: data.customer,
    billingEmail: data.billingEmail,
    details: [
      ...(invoice.purchaseOrderReference
        ? [{ label: "Purchase order", value: invoice.purchaseOrderReference }]
        : []),
      ...(invoice.customerReference
        ? [{ label: "Customer reference", value: invoice.customerReference }]
        : []),
      ...(invoice.issueDate
        ? [{ label: "Issue date", value: date(invoice.issueDate) }]
        : []),
      ...(invoice.dueDate
        ? [{ label: "Due date", value: date(invoice.dueDate) }]
        : []),
      {
        label: "Payment terms",
        value: invoice.paymentTermsDays
          ? `${invoice.paymentTermsDays} days`
          : "Due on receipt",
      },
      { label: "Currency", value: invoice.currency },
    ],
    lines: invoice.lines,
    summary: [
      { label: "Subtotal", minor: invoice.subtotalMinor },
      ...(invoice.discountMinor
        ? [{ label: "Discounts", minor: -invoice.discountMinor }]
        : []),
      ...(invoice.taxMinor ? [{ label: "Tax", minor: invoice.taxMinor }] : []),
      { label: "Invoice total", minor: invoice.totalMinor },
      ...(invoice.amountPaidMinor
        ? [{ label: "Payments received", minor: -invoice.amountPaidMinor }]
        : []),
      ...(credits ? [{ label: "Credits applied", minor: -credits }] : []),
      { label: "Outstanding balance", minor: invoice.balanceDueMinor },
    ],
    notes: [
      config.notes ?? "",
      ...(invoice.invoiceNumber !== null && invoice.balanceDueMinor
        ? [config.paymentInstructions ?? ""]
        : []),
    ],
  };
}

export async function renderInvoiceDocument(
  invoice: InvoiceDocumentSource,
  parties: InvoiceParties,
  onlineUrl?: string,
  payOnline = false,
) {
  return renderFinancialDocument({
    ...(await invoiceDocumentData(invoice, parties)),
    onlineUrl,
    payOnline,
  });
}
