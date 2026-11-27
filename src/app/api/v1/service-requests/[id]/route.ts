import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { getServiceRequest, updateServiceRequest } from "@/modules/service-requests/service";
import { updateServiceRequestSchema } from "@/modules/service-requests/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const result = await getServiceRequest(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateServiceRequestSchema);
    const result = await updateServiceRequest(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
