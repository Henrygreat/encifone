import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveCompany, getCompany, updateCompany } from "@/modules/crm/service";
import { updateCompanySchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const company = await getCompany(acting, id);
    return NextResponse.json(company);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateCompanySchema);
    const company = await updateCompany(acting, id, input);
    return NextResponse.json(company);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Archive (soft delete) — never a hard delete. See src/modules/crm/service.ts. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const company = await archiveCompany(acting, id);
    return NextResponse.json(company);
  } catch (error) {
    return errorResponse(error);
  }
}
