import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { listAIUsage } from "@/modules/ai/service";
import { listAIUsageQuerySchema } from "@/modules/ai/schemas";
import { parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listAIUsageQuerySchema);
    const result = await listAIUsage(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
