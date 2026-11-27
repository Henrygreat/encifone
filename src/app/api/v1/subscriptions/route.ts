import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { createSubscription, listSubscriptions } from "@/modules/finance/service";
import { createSubscriptionSchema } from "@/modules/finance/schemas";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const subscriptions = await listSubscriptions(acting);
    return NextResponse.json({ items: subscriptions });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createSubscriptionSchema);
    const subscription = await createSubscription(acting, input);
    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
