import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { createCreditNote } from "@/modules/finance/service";
import { createCreditNoteSchema } from "@/modules/finance/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, createCreditNoteSchema);
    const result = await createCreditNote(acting, id, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
