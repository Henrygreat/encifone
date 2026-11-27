import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { updateRetainer } from "@/modules/finance/service";
import { updateRetainerSchema } from "@/modules/finance/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateRetainerSchema);
    const retainer = await updateRetainer(acting, id, input);
    return NextResponse.json(retainer);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
