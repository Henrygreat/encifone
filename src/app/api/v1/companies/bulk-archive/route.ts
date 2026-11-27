import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { bulkArchiveCompanies } from "@/modules/crm/service";
import { bulkContactIdsSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { ids } = await parseJsonBody(request, bulkContactIdsSchema);
    const result = await bulkArchiveCompanies(acting, ids);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
