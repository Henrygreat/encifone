import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { listMembers } from "@/modules/identity/service";
import { errorResponse } from "@/lib/api";

/**
 * Returns members of the CALLER'S active organisation only. There is no
 * `organisationId` request parameter to accept here by design — see
 * docs/SECURITY.md §3 (tenant isolation) and the tenant-isolation tests in
 * tests/integration/tenant-isolation.test.ts.
 */
export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const members = await listMembers(acting);
    return NextResponse.json({ organisationId: acting.organisationId, members });
  } catch (error) {
    return errorResponse(error);
  }
}
