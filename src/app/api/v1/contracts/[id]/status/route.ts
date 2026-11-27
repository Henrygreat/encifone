import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { updateContractStatus } from "@/modules/contracts/service";
import { updateContractStatusSchema } from "@/modules/contracts/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateContractStatusSchema);
    const contract = await updateContractStatus(acting, id, input);
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
