import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { archiveInvoice, getInvoice, updateInvoice } from "@/modules/finance/service";
import { updateInvoiceSchema } from "@/modules/finance/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const invoice = await getInvoice(acting, id);
    return NextResponse.json(invoice);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateInvoiceSchema);
    const invoice = await updateInvoice(acting, id, input);
    return NextResponse.json(invoice);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const invoice = await archiveInvoice(acting, id);
    return NextResponse.json(invoice);
  } catch (error) {
    return financeErrorResponse(error);
  }
}
