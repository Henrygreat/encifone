import { NextResponse } from "next/server";
import { processStripeWebhook } from "@/modules/payments/service";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import { errorResponse } from "@/lib/api";

/**
 * Deliberately unauthenticated — Stripe calls this directly. Security is
 * the Stripe-Signature header, verified inside processStripeWebhook via
 * Stripe's own SDK (never a session check). The gated-conversion attempt
 * happens here, not inside processStripeWebhook itself, to avoid a
 * circular import (src/modules/sales/conversion.ts already depends on
 * src/modules/payments/service.ts).
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    const result = await processStripeWebhook(rawBody, signature);

    if (result.deduped === false && result.handled && result.succeeded && result.payment.opportunityId) {
      await attemptGatedConversion(result.payment.organisationId, result.payment.opportunityId);
    }

    // A minimal acknowledgement only — Stripe doesn't read the response
    // body, and there's no reason to echo the full Payment row (or any
    // other org's data) back over an endpoint whose only caller
    // authenticates via a shared signature rather than a session.
    return NextResponse.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
