import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getNextBestActions } from "@/modules/ai/intelligence";
import { nextBestActionsQuerySchema } from "@/modules/ai/schemas";
import { parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { entityType, entityId } = parseQuery(request, nextBestActionsQuerySchema);
    const result = await getNextBestActions(acting, entityType, entityId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
