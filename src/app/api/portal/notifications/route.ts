import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { listNotificationsForPortalUser } from "@/modules/notifications/service";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const portalSession = await requireActivePortalSession();
    const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "true";
    const notifications = await listNotificationsForPortalUser(portalSession, unreadOnly);
    return NextResponse.json({ notifications });
  } catch (error) {
    return errorResponse(error);
  }
}
