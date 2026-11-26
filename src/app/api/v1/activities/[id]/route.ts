import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getActivity, updateActivity } from "@/modules/activities/service";
import { updateActivitySchema } from "@/modules/activities/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const activity = await getActivity(acting, id);
    return NextResponse.json(activity);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateActivitySchema);
    const activity = await updateActivity(acting, id, input);
    return NextResponse.json(activity);
  } catch (error) {
    return errorResponse(error);
  }
}
