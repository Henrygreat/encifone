import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { getPortalSubscriptions } from "@/modules/finance/service";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const subscriptions = await getPortalSubscriptions(session.organisationId, session.clientId);
    return NextResponse.json({ items: subscriptions });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
