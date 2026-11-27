import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { getPortalRetainers } from "@/modules/finance/service";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const retainers = await getPortalRetainers(session.organisationId, session.clientId);
    return NextResponse.json({ items: retainers });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
