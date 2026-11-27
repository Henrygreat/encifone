import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { createTimeEntry } from "@/modules/workforce/service";
import { createTimeEntrySchema } from "@/modules/workforce/schemas";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createTimeEntrySchema);
    const result = await createTimeEntry(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
