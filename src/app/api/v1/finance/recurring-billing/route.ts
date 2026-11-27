import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { runRecurringBilling } from "@/modules/finance/service";

export async function POST() {
  try {
    const acting = await requireActiveMembership();
    const result = await runRecurringBilling(acting);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
