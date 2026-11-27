import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { getAsset, updateAsset } from "@/modules/assets/service";
import { updateAssetSchema } from "@/modules/assets/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const result = await getAsset(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateAssetSchema);
    const result = await updateAsset(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
