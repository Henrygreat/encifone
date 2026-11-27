import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { deleteClientDocument } from "@/modules/documents/service";
import { errorResponse } from "@/lib/api";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await deleteClientDocument(acting, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
