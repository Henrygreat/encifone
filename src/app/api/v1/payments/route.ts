import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createPayment, generateIdempotencyKey, listPayments } from "@/modules/payments/service";
import { createPaymentIntentSchema, listPaymentsQuerySchema } from "@/modules/payments/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listPaymentsQuerySchema);
    const result = await listPayments(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createPaymentIntentSchema);
    // A client that wants retry-safety sends its own Idempotency-Key and
    // reuses it across retries of the same logical request; one is
    // generated here only as a fallback for a client that doesn't.
    const idempotencyKey = request.headers.get("idempotency-key") ?? generateIdempotencyKey();
    const payment = await createPayment(acting, input, idempotencyKey);
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
