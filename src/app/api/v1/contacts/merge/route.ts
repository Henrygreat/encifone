import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { mergeContacts } from "@/modules/crm/service";
import { mergeContactsSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { keepId, mergeId } = await parseJsonBody(request, mergeContactsSchema);
    const contact = await mergeContacts(acting, keepId, mergeId);
    return NextResponse.json(contact);
  } catch (error) {
    return errorResponse(error);
  }
}
