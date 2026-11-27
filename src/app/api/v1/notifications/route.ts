import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { listNotificationsForMembership } from "@/modules/notifications/service";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "true";
    const notifications = await listNotificationsForMembership(acting, unreadOnly);
    return NextResponse.json({ notifications });
  } catch (error) {
    return errorResponse(error);
  }
}
