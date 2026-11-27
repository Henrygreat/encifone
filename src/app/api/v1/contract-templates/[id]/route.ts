import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveContractTemplate, updateContractTemplate } from "@/modules/contracts/service";
import { updateContractTemplateSchema } from "@/modules/contracts/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateContractTemplateSchema);
    const template = await updateContractTemplate(acting, id, input);
    return NextResponse.json(template);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Archive (soft delete) — never a hard delete. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const template = await archiveContractTemplate(acting, id);
    return NextResponse.json(template);
  } catch (error) {
    return errorResponse(error);
  }
}
