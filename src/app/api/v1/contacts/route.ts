import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createContact, listContacts } from "@/modules/crm/service";
import { createContactSchema, listContactsQuerySchema } from "@/modules/crm/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listContactsQuerySchema);
    const result = await listContacts(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createContactSchema);
    const contact = await createContact(acting, input);
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
