import { notFound, redirect } from "next/navigation";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { formatFinanceMoney } from "@/lib/finance-money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { InvoicePaymentForm } from "@/components/finance/document-actions";
import { CopyInvoiceLink } from "@/components/finance/copy-invoice-link";
import { createCreditNote, getInvoice, voidInvoice } from "@/modules/finance/service";
import { createCreditNoteSchema } from "@/modules/finance/schemas";
import { changeInvoicePublicLink, getInvoicePublicUrl } from "@/modules/finance/invoice-sharing";
import { invoiceEmailConfigured, sendInvoiceEmail } from "@/modules/finance/invoice-delivery";
import { refundInvoicePayment } from "@/modules/finance/invoice-refunds";
import { invoiceGatewayConfigured } from "@/modules/payments/invoice-payment-gateway";

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ delivery?: string }> }) {
  const { id } = await params;
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.FINANCE_VIEW)) notFound();
  const invoice = await getInvoice(acting, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const canManage = roleHasCapability(acting.role, Capability.FINANCE_MANAGE);
  const issued = invoice.invoiceNumber !== null;
  const open = ["FINALISED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status);
  const url = getInvoicePublicUrl(invoice);
  const pdf = `/api/v1/invoices/${id}/pdf`;
  const delivery = (await searchParams).delivery;
  async function share(form: FormData) {
    "use server";
    await changeInvoicePublicLink(await requireActiveMembership(), id, true, Number(form.get("expiryDays")));
    redirect(`/invoices/${id}`);
  }
  async function revoke() {
    "use server";
    await changeInvoicePublicLink(await requireActiveMembership(), id, false);
    redirect(`/invoices/${id}`);
  }
  async function credit(form: FormData) {
    "use server";
    const input = createCreditNoteSchema.parse({ amountMinor: Number(form.get("amount")), reason: form.get("reason") });
    await createCreditNote(await requireActiveMembership(), id, input);
    redirect(`/invoices/${id}`);
  }
  async function voidIssued() {
    "use server";
    await voidInvoice(await requireActiveMembership(), id);
    redirect(`/invoices/${id}`);
  }
  async function deliver(form: FormData) {
    "use server";
    const current = await requireActiveMembership();
    try {
      await sendInvoiceEmail(current, id, form.get("kind") === "reminder");
    } catch {
      redirect(`/invoices/${id}?delivery=failed`);
    }
    redirect(`/invoices/${id}?delivery=accepted`);
  }
  async function refund(form: FormData) {
    "use server";
    const current = await requireActiveMembership();
    let status: string;
    try {
      status = await refundInvoicePayment(current, id, String(form.get("allocation") ?? ""));
    } catch {
      redirect(`/invoices/${id}?delivery=refund-error`);
    }
    redirect(`/invoices/${id}?delivery=refund-${status}`);
  }
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader title={issued ? `Invoice ${invoice.invoiceNumber}` : "Draft invoice"} description={invoice.status.replaceAll("_", " ").toLowerCase()} />
      <div className="flex flex-wrap gap-3">
        <Button asChild><a href={pdf}>Download PDF</a></Button>
        <Button asChild variant="outline"><a href={`${pdf}?preview=true`} target="_blank" rel="noreferrer">Open printable PDF</a></Button>
        {!issued && <Button asChild variant="outline"><a href={`/api/v1/finance/documents/proforma/${id}`}>Download proforma</a></Button>}
        {invoice.clientId && <Button asChild variant="outline"><a href={`/api/v1/finance/documents/statement/${invoice.clientId}`}>Download account statement</a></Button>}
      </div>
      <iframe src={`${pdf}?preview=true`} title="Invoice PDF preview" className="h-[65vh] w-full rounded-lg border bg-background" />
      {canManage && issued && invoice.status !== "VOID" && (
        <Card>
          <CardHeader><CardTitle>Online invoice link</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {url && <>
              <Label className="grid gap-2">Share this secure link<Input readOnly value={url} /></Label>
              <CopyInvoiceLink url={url} />
              <Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">Open online invoice</a></Button>
              <form action={revoke}><Button variant="outline">Revoke link</Button></form>
            </>}
            {url && invoiceEmailConfigured() && (
              <form action={deliver} className="flex flex-wrap gap-3">
                <Button type="submit" name="kind" value="invoice">Send or resend invoice</Button>
                {open && invoice.balanceDueMinor > 0 && <Button variant="outline" type="submit" name="kind" value="reminder">Send payment reminder</Button>}
              </form>
            )}
            {delivery === "accepted" && <p role="status">The email provider accepted the message.</p>}
            {delivery === "failed" && <p role="alert">Email could not be sent. Check the saved billing email and delivery configuration.</p>}
            <form action={share} className="flex flex-wrap items-end gap-3">
              <Label className="grid gap-2">Expires after (days)<Input name="expiryDays" type="number" min={1} max={90} defaultValue={30} required /></Label>
              <Button variant="outline">{url ? "Regenerate link" : "Generate link"}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!invoice.allocations.length && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
          {delivery === "refund-succeeded" && <p role="status">Refund recorded.</p>}
          {delivery === "refund-pending" && <p role="status">Refund submitted to the payment provider.</p>}
          {delivery === "refund-error" && <p role="alert">The refund could not be confirmed. Check the payment history before retrying.</p>}
          {invoice.allocations.map(({ id, amountMinor, allocatedAt, payment }) => (
            <div key={id} className="space-y-2 break-words text-sm">
              <p>{allocatedAt.toISOString().slice(0, 10)} · {formatFinanceMoney(amountMinor, invoice.currency)} · {payment.method.toLowerCase().replaceAll("_", " ")}{" "}
                {payment.refundedMinor > 0 && <span>· {formatFinanceMoney(payment.refundedMinor, invoice.currency)} refunded </span>}
                {["SUCCEEDED", "REFUNDED"].includes(payment.status) && <a className="underline" href={`/api/v1/finance/documents/receipt/${invoice.id}?reference=${id}`}>Download receipt</a>}
              </p>
              {canManage && payment.provider === "STRIPE" && payment.status === "SUCCEEDED" && invoiceGatewayConfigured() && (
                <details><summary className="cursor-pointer">Refund remaining payment</summary>
                  <form action={refund} className="mt-2">
                    <input type="hidden" name="allocation" value={id} />
                    <Button variant="destructive" type="submit">Confirm refund of {formatFinanceMoney(payment.amountMinor - payment.refundedMinor, payment.currency)}</Button>
                  </form>
                </details>
              )}
            </div>
          ))}
          {invoice.creditNotes.map((credit) => <p key={credit.id} className="text-sm">
            <a className="underline" href={`/api/v1/finance/documents/credit-note/${invoice.id}?reference=${credit.id}`}>Download credit note {credit.number}</a>
          </p>)}
          {canManage && open && invoice.balanceDueMinor > 0 &&
            <InvoicePaymentForm id={id} currency={invoice.currency} balance={invoice.balanceDueMinor} />}
          {canManage && open && invoice.balanceDueMinor > 0 && (
            <details>
              <summary className="cursor-pointer">Issue credit note</summary>
              <form action={credit} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Label className="grid gap-2">Credit amount (minor units)<Input name="amount" type="number" min={1} max={invoice.balanceDueMinor} required /></Label>
                <Label className="grid gap-2">Reason<Input name="reason" maxLength={2000} required /></Label>
                <Button variant="outline" type="submit" className="justify-self-start">Apply credit</Button>
              </form>
            </details>
          )}
          {canManage && ["FINALISED", "OVERDUE"].includes(invoice.status) && !invoice.allocations.length && !invoice.creditNotes.length && (
            <details><summary className="cursor-pointer">Void this invoice</summary>
              <form className="mt-2" action={voidIssued}><Button type="submit" variant="destructive">Confirm void</Button></form>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
