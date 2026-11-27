import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { approveTimeEntry } from "@/modules/workforce/service";
import { approveTimeEntrySchema } from "@/modules/workforce/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, approveTimeEntrySchema);
    const result = await approveTimeEntry(acting, id, input.approve);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
