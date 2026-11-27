import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { acceptPortalEstimate } from "@/modules/finance/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireActivePortalSession();
    const { id } = await params;
    const result = await acceptPortalEstimate(session, id);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
