import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse } from "@/lib/api";
import { listWorkforceDirectory } from "@/modules/workforce/service";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const result = await listWorkforceDirectory(acting);
    return NextResponse.json({ members: result });
  } catch (error) {
    return errorResponse(error);
  }
}
