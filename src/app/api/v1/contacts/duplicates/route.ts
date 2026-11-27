import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { findDuplicateContacts } from "@/modules/crm/service";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const groups = await findDuplicateContacts(acting);
    return NextResponse.json({ groups });
  } catch (error) {
    return errorResponse(error);
  }
}
