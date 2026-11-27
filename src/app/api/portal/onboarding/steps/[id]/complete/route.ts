import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { completeOnboardingStep } from "@/modules/onboarding/service";
import { completeStepSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const portalSession = await requireActivePortalSession();
    const { data } = await parseJsonBody(request, completeStepSchema);
    const step = await completeOnboardingStep({ portalSession }, id, data);
    return NextResponse.json(step);
  } catch (error) {
    return errorResponse(error);
  }
}
