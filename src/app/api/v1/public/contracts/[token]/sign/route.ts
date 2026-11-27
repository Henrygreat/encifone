import { NextResponse } from "next/server";
import { signContractPublicly } from "@/modules/contracts/service";
import { publicSignContractSchema } from "@/modules/contracts/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { signerName } = await parseJsonBody(request, publicSignContractSchema);
    const contract = await signContractPublicly(token, signerName, clientIp(request));
    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
