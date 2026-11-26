import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createOpportunity, listOpportunities } from "@/modules/sales/service";
import { createOpportunitySchema, listOpportunitiesQuerySchema } from "@/modules/sales/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listOpportunitiesQuerySchema);
    const result = await listOpportunities(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createOpportunitySchema);
    const opportunity = await createOpportunity(acting, input);
    return NextResponse.json(opportunity, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
