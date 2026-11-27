import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { acceptEstimate } from "@/modules/finance/service";
import { acceptEstimateSchema } from "@/modules/finance/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, acceptEstimateSchema);
    const result = await acceptEstimate(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
