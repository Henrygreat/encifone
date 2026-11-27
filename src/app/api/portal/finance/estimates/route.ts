import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { listPortalEstimates } from "@/modules/finance/service";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const estimates = await listPortalEstimates(session.organisationId, session.clientId);
    return NextResponse.json({ items: estimates });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
