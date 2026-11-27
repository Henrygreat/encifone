import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createContractTemplate, listContractTemplates } from "@/modules/contracts/service";
import { createContractTemplateSchema, listContractTemplatesQuerySchema } from "@/modules/contracts/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listContractTemplatesQuerySchema);
    const result = await listContractTemplates(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createContractTemplateSchema);
    const template = await createContractTemplate(acting, input);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
