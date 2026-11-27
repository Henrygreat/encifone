import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { updateMembershipProfile } from "@/modules/workforce/service";
import { updateMembershipProfileSchema } from "@/modules/workforce/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ membershipId: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { membershipId } = await params;
    const input = await parseJsonBody(request, updateMembershipProfileSchema);
    const result = await updateMembershipProfile(acting, membershipId, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
