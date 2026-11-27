import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveServicePackage, updateServicePackage } from "@/modules/catalogue/service";
import { updateServicePackageSchema } from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody } from "@/lib/api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateServicePackageSchema);
    const pkg = await updateServicePackage(acting, id, input);
    return NextResponse.json(pkg);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const pkg = await archiveServicePackage(acting, id);
    return NextResponse.json(pkg);
  } catch (error) {
    return errorResponse(error);
  }
}
