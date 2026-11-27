import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { completeOnboardingStep } from "@/modules/onboarding/service";
import { completeStepSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

/** Internal-side completion — for a step assignedTo INTERNAL. A client
 * completes their own steps via /api/portal/onboarding/steps/[id]/complete
 * instead, which resolves its actor from the portal session, never a
 * client-supplied id. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const { data } = await parseJsonBody(request, completeStepSchema);
    const step = await completeOnboardingStep({ acting }, id, data);
    return NextResponse.json(step);
  } catch (error) {
    return errorResponse(error);
  }
}
