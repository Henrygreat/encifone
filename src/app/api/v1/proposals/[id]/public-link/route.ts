import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { ensurePublicLink } from "@/modules/proposals/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const proposal = await ensurePublicLink(acting, id);
    return NextResponse.json({ publicToken: proposal.publicToken });
  } catch (error) {
    return errorResponse(error);
  }
}
