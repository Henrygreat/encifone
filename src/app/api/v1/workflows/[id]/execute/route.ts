import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { triggerWorkflowExecution } from "@/modules/workflows/service";
import { executeWorkflowSchema } from "@/modules/workflows/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, executeWorkflowSchema);
    const result = await triggerWorkflowExecution(acting, id, input.idempotencyKey, input.payload);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
