import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getClient, updateClient } from "@/modules/clients/service";
import { updateClientSchema } from "@/modules/clients/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const result = await getClient(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateClientSchema);
    const client = await updateClient(acting, id, input);
    return NextResponse.json(client);
  } catch (error) {
    return errorResponse(error);
  }
}
