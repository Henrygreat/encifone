import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getNextBestActions } from "@/modules/ai/intelligence";
import { nextBestActionsQuerySchema } from "@/modules/ai/schemas";
import { parseQuery, errorResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    await checkRateLimit(`ai-call:${acting.organisationId}`, 30, 5 * 60);
    const { entityType, entityId } = parseQuery(request, nextBestActionsQuerySchema);
    const result = await getNextBestActions(acting, entityType, entityId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
