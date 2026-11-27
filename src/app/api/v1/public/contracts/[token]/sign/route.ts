import { NextResponse } from "next/server";
import { signContractPublicly } from "@/modules/contracts/service";
import { publicSignContractSchema } from "@/modules/contracts/schemas";
import { attemptGatedConversion } from "@/modules/sales/conversion";
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

    // Signing may be the gate the org's conversion rule was waiting on —
    // a no-op if conversionRequiresContract is off, the opportunity isn't
    // linked, or a payment gate is also required and not yet satisfied.
    if (contract.opportunityId) {
      await attemptGatedConversion(contract.organisationId, contract.opportunityId);
    }

    return NextResponse.json(contract);
  } catch (error) {
    return errorResponse(error);
  }
}
