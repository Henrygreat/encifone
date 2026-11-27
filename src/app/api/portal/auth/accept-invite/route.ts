import { NextResponse } from "next/server";
import { acceptClientPortalInvite } from "@/modules/portal/auth";
import { acceptPortalInviteSchema } from "@/modules/portal/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await checkRateLimit(`portal-accept-invite:${clientIpFrom(request)}`, 20, 300);
    const input = await parseJsonBody(request, acceptPortalInviteSchema);
    await acceptClientPortalInvite(input);
    return NextResponse.json({ loggedIn: true });
  } catch (error) {
    return errorResponse(error);
  }
}
