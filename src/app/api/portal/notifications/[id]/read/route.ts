import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { markPortalNotificationRead } from "@/modules/notifications/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const portalSession = await requireActivePortalSession();
    await markPortalNotificationRead(portalSession.portalUserId, id);
    return NextResponse.json({ read: true });
  } catch (error) {
    return errorResponse(error);
  }
}
