import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { getPortalOnboarding } from "@/modules/onboarding/service";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const onboarding = await getPortalOnboarding(session);
    return NextResponse.json({ onboarding });
  } catch (error) {
    return errorResponse(error);
  }
}
