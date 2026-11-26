import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveLead, getLead, updateLead } from "@/modules/crm/service";
import { updateLeadSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const lead = await getLead(acting, id);
    return NextResponse.json(lead);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateLeadSchema);
    const lead = await updateLead(acting, id, input);
    return NextResponse.json(lead);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Archive (soft delete) — never a hard delete. See src/modules/crm/service.ts. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const lead = await archiveLead(acting, id);
    return NextResponse.json(lead);
  } catch (error) {
    return errorResponse(error);
  }
}
