import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { archiveEstimate, getEstimate, updateEstimate } from "@/modules/finance/service";
import { updateEstimateSchema } from "@/modules/finance/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const estimate = await getEstimate(acting, id);
    return NextResponse.json(estimate);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateEstimateSchema);
    const estimate = await updateEstimate(acting, id, input);
    return NextResponse.json(estimate);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const result = await archiveEstimate(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
