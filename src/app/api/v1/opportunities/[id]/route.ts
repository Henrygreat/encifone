import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveOpportunity, getOpportunity, updateOpportunity } from "@/modules/sales/service";
import { updateOpportunitySchema } from "@/modules/sales/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const opportunity = await getOpportunity(acting, id);
    return NextResponse.json(opportunity);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateOpportunitySchema);
    const opportunity = await updateOpportunity(acting, id, input);
    return NextResponse.json(opportunity);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Soft delete (archive) — never a hard delete. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const opportunity = await archiveOpportunity(acting, id);
    return NextResponse.json(opportunity);
  } catch (error) {
    return errorResponse(error);
  }
}
