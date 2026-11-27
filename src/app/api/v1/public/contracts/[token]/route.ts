import { NextResponse } from "next/server";
import { getContractByPublicToken } from "@/modules/contracts/service";
import { errorResponse } from "@/lib/api";

/** Deliberately unauthenticated — see src/modules/contracts/service.ts. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const contract = await getContractByPublicToken(token);
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
