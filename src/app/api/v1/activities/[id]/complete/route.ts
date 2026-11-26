import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { completeActivity } from "@/modules/activities/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const activity = await completeActivity(acting, id);
    return NextResponse.json(activity);
  } catch (error) {
    return errorResponse(error);
  }
}
