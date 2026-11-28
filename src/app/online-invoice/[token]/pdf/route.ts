import { financeErrorResponse } from "@/modules/finance/http";
import { renderInvoiceDocument } from "@/modules/finance/document-settings";
import { getPublicInvoice } from "@/modules/finance/invoice-sharing";
import { invoiceCheckoutAvailable } from "@/modules/finance/invoice-checkout";
import { env } from "@/lib/env";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const invoice = await getPublicInvoice(token);
    const url = new URL(`/online-invoice/${token}`, env.APP_URL).toString();
    const pdf = await renderInvoiceDocument(
      invoice,
      invoice,
      url,
      invoice.balanceDueMinor > 0 &&
        (await invoiceCheckoutAvailable(invoice.organisationId)),
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=invoice.pdf",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
