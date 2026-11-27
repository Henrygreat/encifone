import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { overrideCompleteOnboardingStep } from "@/modules/onboarding/service";
import { overrideStepSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const { note } = await parseJsonBody(request, overrideStepSchema);
    const step = await overrideCompleteOnboardingStep(acting, id, note);
    return NextResponse.json(step);
  } catch (error) {
    return errorResponse(error);
  }
}
