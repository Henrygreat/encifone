import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getActionCentreItems } from "@/modules/intelligence/action-centre";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const items = await getActionCentreItems(acting);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
