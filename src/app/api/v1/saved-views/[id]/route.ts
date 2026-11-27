import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { deleteSavedView, updateSavedView } from "@/modules/views/service";
import { updateSavedViewSchema } from "@/modules/views/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateSavedViewSchema);
    const view = await updateSavedView(acting, id, input);
    return NextResponse.json(view);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const result = await deleteSavedView(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
