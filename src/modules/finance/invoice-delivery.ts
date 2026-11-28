import { createHash } from "node:crypto";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { ValidationError } from "@/lib/api";
import { formatFinanceMoney } from "@/lib/finance-money";
import { requireCapability } from "@/modules/operations/auth";
import { invoiceDocumentData } from "./document-settings";
import { getInvoicePublicUrl } from "./invoice-sharing";
import { getInvoice } from "./service";

export function invoiceEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.FINANCE_EMAIL_FROM);
}

export async function sendInvoiceEmail(
  acting: ActiveMembership,
  id: string,
  reminder: boolean,
) {
  requireCapability(acting, Capability.FINANCE_MANAGE);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FINANCE_EMAIL_FROM;
  if (!key || !from)
    throw new ValidationError(["Invoice email is unavailable."]);
  const invoice = await getInvoice(acting, id);
  const url = getInvoicePublicUrl(invoice);
  if (!url)
    throw new ValidationError([
      "Generate an active sharing link before sending the invoice.",
    ]);
  if (reminder && invoice.balanceDueMinor <= 0)
    throw new ValidationError(["This invoice has no outstanding balance."]);
  const data = await invoiceDocumentData(invoice, invoice);
  const recipient = data.billingEmail;
  if (!recipient)
    throw new ValidationError(["A saved billing email is required."]);
  const subject = `${reminder ? "Payment reminder for invoice" : "Invoice"} ${data.reference}`;
  const text = [
    subject,
    data.seller[0],
    `Outstanding balance: ${formatFinanceMoney(invoice.balanceDueMinor, invoice.currency)}`,
    ...data.details
      .filter(({ label }) => label === "Due date")
      .map(({ value }) => `Due: ${value}`),
    url,
  ].join("\n\n");
  const generation = Math.floor(Date.now() / 60_000);
  const idempotency = createHash("sha256")
    .update(JSON.stringify([from, recipient, subject, text, generation]))
    .digest("hex");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice/${idempotency}`,
    },
    body: JSON.stringify({ from, to: [recipient], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error("The email provider did not accept the message.");
  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    resourceType: "Invoice",
    resourceId: id,
    action: reminder ? "invoice.reminder_accepted" : "invoice.email_accepted",
  });
}
