import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createCompany, listCompanies } from "@/modules/crm/service";
import { createCompanySchema, listCompaniesQuerySchema } from "@/modules/crm/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listCompaniesQuerySchema);
    const result = await listCompanies(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createCompanySchema);
    const company = await createCompany(acting, input);
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
