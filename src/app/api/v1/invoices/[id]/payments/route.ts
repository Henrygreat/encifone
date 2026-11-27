import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { recordInvoicePayment } from "@/modules/finance/service";
import { recordPaymentSchema } from "@/modules/finance/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, recordPaymentSchema);
    const result = await recordInvoicePayment(acting, id, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
