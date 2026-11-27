import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { addTicketComment } from "@/modules/helpdesk/service";
import { addTicketCommentSchema } from "@/modules/helpdesk/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, addTicketCommentSchema);
    const result = await addTicketComment(acting, id, input.body, input.isInternal);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
