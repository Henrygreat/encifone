import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { generateInvoicePdf } from "@/modules/finance/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const pdf = await generateInvoicePdf(acting, id);
    const disposition = new URL(request.url).searchParams.get("preview") === "true" ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename=invoice.pdf`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
