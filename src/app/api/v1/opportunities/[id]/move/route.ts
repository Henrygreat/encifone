import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { moveOpportunity } from "@/modules/sales/service";
import { moveOpportunitySchema } from "@/modules/sales/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

/** Kanban drag-drop persistence. The client applies the move optimistically
 * and calls this to persist it; on failure it must roll the card back and
 * surface a toast — see the /deals page. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, moveOpportunitySchema);
    const opportunity = await moveOpportunity(acting, id, input);
    return NextResponse.json(opportunity);
  } catch (error) {
    return errorResponse(error);
  }
}
