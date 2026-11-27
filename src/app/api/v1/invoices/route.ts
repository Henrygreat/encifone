import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { createInvoice, listInvoices } from "@/modules/finance/service";
import { createInvoiceSchema, listInvoicesQuerySchema } from "@/modules/finance/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listInvoicesQuerySchema);
    const result = await listInvoices(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createInvoiceSchema);
    const invoice = await createInvoice(acting, input);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
