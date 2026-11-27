import { NextResponse } from "next/server";
import { processESignatureWebhook } from "@/modules/contracts/service";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import { errorResponse } from "@/lib/api";

/**
 * The webhook a real e-signature vendor would call once one is wired up —
 * see src/modules/contracts/esignature-provider.ts for why this is "mock"
 * today. Deliberately unauthenticated (no session): security is the HMAC
 * signature over the raw body, verified inside processESignatureWebhook,
 * exactly like how a real vendor's webhook would be trusted. Attempts
 * gated conversion afterward for the same reason the Stripe webhook route
 * does — src/modules/sales/conversion.ts can't be called from inside
 * src/modules/contracts/service.ts without a circular import.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-signature");
    const result = await processESignatureWebhook(rawBody, signature);

    if (!result.deduped && !result.alreadyResolved && result.contract?.opportunityId) {
      await attemptGatedConversion(result.contract.organisationId, result.contract.opportunityId);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
