import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getSalesVelocityMetrics } from "@/modules/sales/analytics";
import { salesVelocityQuerySchema } from "@/modules/sales/schemas";
import { parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { pipelineId } = parseQuery(request, salesVelocityQuerySchema);
    const metrics = await getSalesVelocityMetrics(acting, pipelineId);
    return NextResponse.json(metrics);
  } catch (error) {
    return errorResponse(error);
  }
}
