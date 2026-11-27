import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { updateProposalStatus } from "@/modules/proposals/service";
import { updateProposalStatusSchema } from "@/modules/proposals/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateProposalStatusSchema);
    const proposal = await updateProposalStatus(acting, id, input);
    return NextResponse.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
