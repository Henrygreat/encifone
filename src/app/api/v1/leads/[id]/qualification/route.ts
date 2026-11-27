import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getLeadQualification } from "@/modules/ai/intelligence";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const result = await getLeadQualification(acting, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
