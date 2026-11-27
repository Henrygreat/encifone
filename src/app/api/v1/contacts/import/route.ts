import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { importContactsCsv } from "@/modules/crm/service";
import { importContactsCsvSchema } from "@/modules/crm/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const { csv } = await parseJsonBody(request, importContactsCsvSchema);
    const result = await importContactsCsv(acting, csv);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
