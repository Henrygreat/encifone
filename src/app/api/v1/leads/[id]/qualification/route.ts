import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getLeadQualification } from "@/modules/ai/intelligence";
import { errorResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    // AI calls cost real provider spend — limited per org, not per user,
    // since the deterministic result (always returned regardless) is
    // free and the point is bounding AI_gateway call volume.
    await checkRateLimit(`ai-call:${acting.organisationId}`, 30, 5 * 60);
    const result = await getLeadQualification(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
