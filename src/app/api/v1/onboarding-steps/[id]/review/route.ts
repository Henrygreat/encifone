import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { reviewOnboardingStep } from "@/modules/onboarding/service";
import { reviewStepSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const { decision, note } = await parseJsonBody(request, reviewStepSchema);
    const step = await reviewOnboardingStep(acting, id, decision, note);
    return NextResponse.json(step);
  } catch (error) {
    return errorResponse(error);
  }
}
