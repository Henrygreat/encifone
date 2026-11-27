import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getOrganisationSettings, updateOrganisationSettings } from "@/modules/identity/service";
import { updateOrganisationSettingsSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const settings = await getOrganisationSettings(acting);
    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateOrganisationSettingsSchema);
    const settings = await updateOrganisationSettings(acting, input);
    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse(error);
  }
}
