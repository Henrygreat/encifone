import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { updateSubscription } from "@/modules/finance/service";
import { updateSubscriptionSchema } from "@/modules/finance/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateSubscriptionSchema);
    const subscription = await updateSubscription(acting, id, input);
    return NextResponse.json(subscription);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
