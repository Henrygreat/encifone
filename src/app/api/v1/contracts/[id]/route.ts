import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getContract } from "@/modules/contracts/service";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const contract = await getContract(acting, id);
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
