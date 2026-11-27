import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getProposal } from "@/modules/proposals/service";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const proposal = await getProposal(acting, id);
    return NextResponse.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
