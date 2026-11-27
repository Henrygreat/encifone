import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { finaliseInvoice } from "@/modules/finance/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const invoice = await finaliseInvoice(acting, id);
    return NextResponse.json(invoice);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
