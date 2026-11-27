import { NextResponse } from "next/server";
import { loginPortalUser } from "@/modules/portal/auth";
import { portalLoginSchema } from "@/modules/portal/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

/** Unauthenticated by definition — this IS the login endpoint. Rate
 * limited by IP, same 20/5min budget as the other unauthenticated
 * public endpoints (public proposal/contract sign/decline). */
export async function POST(request: Request) {
  try {
    await checkRateLimit(`portal-login:${clientIpFrom(request)}`, 20, 300);
    const { email, password } = await parseJsonBody(request, portalLoginSchema);
    await loginPortalUser(email, password);
    return NextResponse.json({ loggedIn: true });
  } catch (error) {
    return errorResponse(error);
  }
}
