import { NextResponse } from "next/server";
import { declineContractPublicly } from "@/modules/contracts/service";
import { errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    await checkRateLimit(`public-sign:${clientIpFrom(request)}`, 20, 5 * 60);
    const { token } = await params;
    const contract = await declineContractPublicly(token);
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
