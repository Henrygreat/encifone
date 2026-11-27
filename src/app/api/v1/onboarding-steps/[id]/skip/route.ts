import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { skipOnboardingStep } from "@/modules/onboarding/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const step = await skipOnboardingStep(acting, id);
    return NextResponse.json(step);
  } catch (error) {
    return errorResponse(error);
  }
}
