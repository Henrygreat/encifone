import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createProposalVersion } from "@/modules/proposals/service";
import { createProposalVersionSchema } from "@/modules/proposals/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createProposalVersionSchema);
    const version = await createProposalVersion(acting, id, input);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
