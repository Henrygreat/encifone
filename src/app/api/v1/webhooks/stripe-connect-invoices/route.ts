import { getInvoicePaymentGateway, invoiceGatewayConfigured } from "@/modules/payments/invoice-payment-gateway";
import { settleCheckout } from "@/modules/finance/invoice-checkout";
import { reconcileInvoiceRefund } from "@/modules/finance/invoice-refunds";

export async function POST(request: Request) {
  if (!invoiceGatewayConfigured()) return new Response(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  let event;
  let refund;
  try {
    const body = await request.text();
    const gateway = getInvoicePaymentGateway();
    event = gateway.verifyCheckoutEvent(body, signature);
    if (!event) refund = gateway.verifyRefundEvent(body, signature);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (event || refund) {
    try {
      if (event) await settleCheckout(event.account, event.session);
      if (refund) await reconcileInvoiceRefund(refund.account, refund.refund);
    } catch {
      console.error("Stripe Connect invoice settlement failed.");
      return new Response(null, { status: 500 });
    }
  }
  return Response.json({ received: true });
}
