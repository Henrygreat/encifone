import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getLead } from "@/modules/crm/service";
import { calculateLeadScore } from "@/modules/intelligence/lead-scoring";
import { errorResponse } from "@/lib/api";

/** The explainability requirement (docs/AI_ARCHITECTURE.md §8): never just
 * the number, always the factors that produced it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const lead = await getLead(acting, id);
    const breakdown = calculateLeadScore(lead);
    return NextResponse.json(breakdown);
  } catch (error) {
    return errorResponse(error);
  }
}
