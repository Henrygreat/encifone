import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createContractVersion } from "@/modules/contracts/service";
import { createContractVersionSchema } from "@/modules/contracts/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createContractVersionSchema);
    const version = await createContractVersion(acting, id, input);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
