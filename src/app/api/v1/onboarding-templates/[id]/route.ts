import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveOnboardingTemplate, getOnboardingTemplate, updateOnboardingTemplate } from "@/modules/onboarding/service";
import { updateOnboardingTemplateSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const template = await getOnboardingTemplate(acting, id);
    return NextResponse.json(template);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateOnboardingTemplateSchema);
    const template = await updateOnboardingTemplate(acting, id, input);
    return NextResponse.json(template);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await archiveOnboardingTemplate(acting, id);
    return NextResponse.json({ archived: true });
  } catch (error) {
    return errorResponse(error);
  }
}
