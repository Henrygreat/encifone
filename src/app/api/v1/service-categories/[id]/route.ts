import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { deleteServiceCategory, updateServiceCategory } from "@/modules/catalogue/service";
import { updateServiceCategorySchema } from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody } from "@/lib/api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateServiceCategorySchema);
    const category = await updateServiceCategory(acting, id, input);
    return NextResponse.json(category);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await deleteServiceCategory(acting, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
