import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { transitionClientLifecycle } from "@/modules/clients/service";
import { transitionLifecycleSchema } from "@/modules/clients/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, transitionLifecycleSchema);
    const client = await transitionClientLifecycle(acting, id, input);
    return NextResponse.json(client);
  } catch (error) {
    return errorResponse(error);
  }
}
