import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getDealRiskAssessment } from "@/modules/ai/intelligence";
import { errorResponse } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await checkRateLimit(`ai-call:${acting.organisationId}`, 30, 5 * 60);
    const result = await getDealRiskAssessment(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
