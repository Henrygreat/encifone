import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { ValidationError, errorResponse, parseJsonBody } from "@/lib/api";
import { linkServiceToClient, unlinkServiceFromClient } from "@/modules/catalogue/service";
import { linkServiceToClientSchema } from "@/modules/catalogue/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, linkServiceToClientSchema);
    const link = await linkServiceToClient(acting, id, input);
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) throw new ValidationError(["clientId: Query parameter is required."]);
    await unlinkServiceFromClient(acting, id, clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
