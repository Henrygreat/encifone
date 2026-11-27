import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { transitionSubscription } from "@/modules/finance/service";
import { subscriptionTransitionSchema } from "@/modules/finance/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, subscriptionTransitionSchema);
    const subscription = await transitionSubscription(acting, id, input);
    return NextResponse.json(subscription);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
