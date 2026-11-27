import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { duplicateEstimate } from "@/modules/finance/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const estimate = await duplicateEstimate(acting, id);
    return NextResponse.json(estimate, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
