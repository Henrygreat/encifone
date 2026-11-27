import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse } from "@/lib/api";
import { listWorkflowExecutions } from "@/modules/workflows/service";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const workflowId = new URL(request.url).searchParams.get("workflowId") ?? undefined;
    const result = await listWorkflowExecutions(acting, workflowId);
    return NextResponse.json({ executions: result });
  } catch (error) {
    return errorResponse(error);
  }
}
