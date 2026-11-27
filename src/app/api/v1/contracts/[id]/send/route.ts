import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { sendContractForSignature } from "@/modules/contracts/service";
import { createSignatureRequestSchema } from "@/modules/contracts/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createSignatureRequestSchema);
    const result = await sendContractForSignature(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
