import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createOnboardingTemplate, listOnboardingTemplates } from "@/modules/onboarding/service";
import { createOnboardingTemplateSchema } from "@/modules/onboarding/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const templates = await listOnboardingTemplates(acting);
    return NextResponse.json({ templates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createOnboardingTemplateSchema);
    const template = await createOnboardingTemplate(acting, input);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
