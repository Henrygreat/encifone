import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getClientOnboarding, startOnboarding } from "@/modules/onboarding/service";
import { startOnboardingSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const onboarding = await getClientOnboarding(acting, id);
    return NextResponse.json({ onboarding });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const { templateId } = await parseJsonBody(request, startOnboardingSchema);
    const onboarding = await startOnboarding(acting, id, templateId);
    return NextResponse.json(onboarding, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
