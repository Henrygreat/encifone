import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { assignTeamMember } from "@/modules/workforce/service";
import { assignTeamMemberSchema } from "@/modules/workforce/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, assignTeamMemberSchema);
    const result = await assignTeamMember(acting, id, input.membershipId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
