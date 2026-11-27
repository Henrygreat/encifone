import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { ValidationError, errorResponse, parseJsonBody } from "@/lib/api";
import { linkServiceToContract, unlinkServiceFromContract } from "@/modules/catalogue/service";
import { linkServiceToContractSchema } from "@/modules/catalogue/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, linkServiceToContractSchema);
    const link = await linkServiceToContract(acting, id, input);
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
    const contractId = url.searchParams.get("contractId");
    if (!contractId) throw new ValidationError(["contractId: Query parameter is required."]);
    await unlinkServiceFromContract(acting, id, contractId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
