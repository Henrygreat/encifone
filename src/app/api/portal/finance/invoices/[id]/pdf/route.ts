import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { generatePortalInvoicePdf } from "@/modules/finance/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireActivePortalSession();
    const { id } = await params;
    const pdf = await generatePortalInvoicePdf(session, id);
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
