import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createSavedView, listSavedViews } from "@/modules/views/service";
import { createSavedViewSchema, listSavedViewsQuerySchema } from "@/modules/views/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { entityType } = parseQuery(request, listSavedViewsQuerySchema);
    const views = await listSavedViews(acting, entityType);
    return NextResponse.json({ views });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createSavedViewSchema);
    const view = await createSavedView(acting, input);
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
