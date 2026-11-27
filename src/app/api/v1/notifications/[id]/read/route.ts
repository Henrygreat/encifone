import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { markNotificationRead } from "@/modules/notifications/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    // The where-clause inside markNotificationRead (id + the caller's own
    // membershipId) is the isolation check — a notification addressed to
    // someone else simply matches zero rows, never a 403 that would leak
    // whether it exists.
    await markNotificationRead(acting.membershipId, id);
    return NextResponse.json({ read: true });
  } catch (error) {
    return errorResponse(error);
  }
}
