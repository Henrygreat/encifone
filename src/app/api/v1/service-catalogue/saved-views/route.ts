import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import {
  createServiceCatalogueSavedView,
  listServiceCatalogueSavedViews,
} from "@/modules/catalogue/service";
import { createServiceCatalogueSavedViewSchema } from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const views = await listServiceCatalogueSavedViews(acting);
    return NextResponse.json({ views });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createServiceCatalogueSavedViewSchema);
    const view = await createServiceCatalogueSavedView(acting, input);
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
