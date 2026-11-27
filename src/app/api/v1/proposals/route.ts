import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createProposal, listProposals } from "@/modules/proposals/service";
import { createProposalSchema, listProposalsQuerySchema } from "@/modules/proposals/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listProposalsQuerySchema);
    const result = await listProposals(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createProposalSchema);
    const proposal = await createProposal(acting, input);
    return NextResponse.json(proposal, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
