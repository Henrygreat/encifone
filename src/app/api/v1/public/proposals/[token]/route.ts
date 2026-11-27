import { NextResponse } from "next/server";
import { getProposalByPublicToken } from "@/modules/proposals/service";
import { errorResponse } from "@/lib/api";

/**
 * Deliberately unauthenticated — this is the secure public link a client
 * opens without a session. Security comes from the token itself being an
 * unguessable 24-byte random value (src/modules/proposals/service.ts's
 * ensurePublicLink), not from a session check. Never resolved by the
 * proposal's own id.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const proposal = await getProposalByPublicToken(token);
    return NextResponse.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
