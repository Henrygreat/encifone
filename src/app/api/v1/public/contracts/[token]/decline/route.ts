import { NextResponse } from "next/server";
import { declineContractPublicly } from "@/modules/contracts/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const contract = await declineContractPublicly(token);
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
