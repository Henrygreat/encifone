import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveServiceItem, getServiceItem, updateServiceItem } from "@/modules/catalogue/service";
import { updateServiceItemSchema } from "@/modules/catalogue/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const item = await getServiceItem(acting, id);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateServiceItemSchema);
    const item = await updateServiceItem(acting, id, input);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Archive (soft delete) — never a hard delete. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const item = await archiveServiceItem(acting, id);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}
