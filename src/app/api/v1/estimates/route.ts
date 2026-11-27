import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { createEstimate, listEstimates } from "@/modules/finance/service";
import { createEstimateSchema, listEstimatesQuerySchema } from "@/modules/finance/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listEstimatesQuerySchema);
    const result = await listEstimates(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createEstimateSchema);
    const estimate = await createEstimate(acting, input);
    return NextResponse.json(estimate, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
