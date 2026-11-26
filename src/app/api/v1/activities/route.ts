import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createActivity, listActivities } from "@/modules/activities/service";
import { createActivitySchema, listActivitiesQuerySchema } from "@/modules/activities/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listActivitiesQuerySchema);
    const result = await listActivities(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createActivitySchema);
    const activity = await createActivity(acting, input);
    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
