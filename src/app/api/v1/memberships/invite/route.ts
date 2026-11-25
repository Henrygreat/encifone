import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { inviteMember } from "@/modules/identity/service";
import { inviteMemberSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, inviteMemberSchema);
    const result = await inviteMember(acting, input);
    // Phase 1 has no email provider wired up yet (docs/ROADMAP.md) — the
    // invite token is returned directly so the inviting admin can share the
    // accept-invite link out of band until email delivery lands.
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
