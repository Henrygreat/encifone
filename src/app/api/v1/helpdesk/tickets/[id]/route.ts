import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { getTicket, updateTicket } from "@/modules/helpdesk/service";
import { updateTicketSchema } from "@/modules/helpdesk/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const result = await getTicket(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateTicketSchema);
    const result = await updateTicket(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
