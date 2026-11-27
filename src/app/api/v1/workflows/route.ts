import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { createWorkflowDefinition, listWorkflowDefinitions } from "@/modules/workflows/service";
import { createWorkflowDefinitionSchema, listWorkflowDefinitionsQuerySchema } from "@/modules/workflows/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listWorkflowDefinitionsQuerySchema);
    const result = await listWorkflowDefinitions(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createWorkflowDefinitionSchema);
    const result = await createWorkflowDefinition(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
