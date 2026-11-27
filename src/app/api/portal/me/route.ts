import { NextResponse } from "next/server";
import { getPortalProfile, requireActivePortalSession } from "@/modules/portal/auth";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const profile = await getPortalProfile(session);
    return NextResponse.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
