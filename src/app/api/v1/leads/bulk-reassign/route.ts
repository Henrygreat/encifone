import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { bulkReassignLeadOwner } from "@/modules/crm/service";
import { bulkReassignOwnerSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { ids, ownerId } = await parseJsonBody(request, bulkReassignOwnerSchema);
    const result = await bulkReassignLeadOwner(acting, ids, ownerId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
