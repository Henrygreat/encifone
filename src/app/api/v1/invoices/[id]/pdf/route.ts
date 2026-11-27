import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { generateInvoicePdf } from "@/modules/finance/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const pdf = await generateInvoicePdf(acting, id);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${id}.pdf`,
      },
    });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
