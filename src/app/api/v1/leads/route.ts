import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createLead, listLeads } from "@/modules/crm/service";
import { createLeadSchema, listLeadsQuerySchema } from "@/modules/crm/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listLeadsQuerySchema);
    const result = await listLeads(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createLeadSchema);
    const lead = await createLead(acting, input);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
