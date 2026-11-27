import { NextResponse } from "next/server";
import { signContractPublicly } from "@/modules/contracts/service";
import { publicSignContractSchema } from "@/modules/contracts/schemas";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import { parseJsonBody, errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = clientIpFrom(request);
    await checkRateLimit(`public-sign:${ip}`, 20, 5 * 60);
    const { token } = await params;
    const { signerName } = await parseJsonBody(request, publicSignContractSchema);
    const contract = await signContractPublicly(token, signerName, ip === "unknown" ? undefined : ip);

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
