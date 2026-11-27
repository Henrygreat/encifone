import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { bulkAddContactTag } from "@/modules/crm/service";
import { bulkAddTagSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { ids, tag } = await parseJsonBody(request, bulkAddTagSchema);
    const result = await bulkAddContactTag(acting, ids, tag);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
