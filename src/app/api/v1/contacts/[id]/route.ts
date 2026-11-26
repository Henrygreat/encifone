import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { archiveContact, getContact, updateContact } from "@/modules/crm/service";
import { updateContactSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const contact = await getContact(acting, id);
    return NextResponse.json(contact);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateContactSchema);
    const contact = await updateContact(acting, id, input);
    return NextResponse.json(contact);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Archive (soft delete) — never a hard delete. See src/modules/crm/service.ts. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const contact = await archiveContact(acting, id);
    return NextResponse.json(contact);
  } catch (error) {
    return errorResponse(error);
  }
}
