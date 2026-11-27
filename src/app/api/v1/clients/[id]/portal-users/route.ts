import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { inviteClientPortalUser, listClientPortalUsers } from "@/modules/portal/auth";
import { inviteClientPortalUserSchema } from "@/modules/portal/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const portalUsers = await listClientPortalUsers(acting, id);
    return NextResponse.json({ portalUsers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const body = await parseJsonBody(request, inviteClientPortalUserSchema.omit({ clientId: true }));
    const { portalUser, inviteUrl } = await inviteClientPortalUser(acting, { ...body, clientId: id });
    // No email delivery exists in this project — the invite link is
    // returned directly for the inviting staffer to share, same pattern
    // as the internal Membership invite flow (/members).
    return NextResponse.json({ portalUser, inviteUrl }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
