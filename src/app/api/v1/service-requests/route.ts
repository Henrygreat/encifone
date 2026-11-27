import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { createServiceRequest, listServiceRequests } from "@/modules/service-requests/service";
import { createServiceRequestSchema, listServiceRequestsQuerySchema } from "@/modules/service-requests/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listServiceRequestsQuerySchema);
    const result = await listServiceRequests(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createServiceRequestSchema);
    const result = await createServiceRequest(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
