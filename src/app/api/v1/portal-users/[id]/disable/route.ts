import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { disableClientPortalUser } from "@/modules/portal/auth";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    await disableClientPortalUser(acting, id);
    return NextResponse.json({ disabled: true });
  } catch (error) {
    return errorResponse(error);
  }
}
