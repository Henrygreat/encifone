import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { deleteServiceCatalogueSavedView } from "@/modules/catalogue/service";
import { errorResponse } from "@/lib/api";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await deleteServiceCatalogueSavedView(acting, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
