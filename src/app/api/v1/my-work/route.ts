import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse } from "@/lib/api";
import { getMyWorkSummary } from "@/modules/tasks/service";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const summary = await getMyWorkSummary(acting);
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
