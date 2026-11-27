import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { listPortalInvoices } from "@/modules/finance/service";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const invoices = await listPortalInvoices(session.organisationId, session.clientId);
    return NextResponse.json({ items: invoices });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
