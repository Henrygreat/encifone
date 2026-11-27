import { NextResponse } from "next/server";
import { resetClientPortalPassword } from "@/modules/portal/auth";
import { resetPortalPasswordSchema } from "@/modules/portal/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await checkRateLimit(`portal-reset-password:${clientIpFrom(request)}`, 20, 300);
    const input = await parseJsonBody(request, resetPortalPasswordSchema);
    await resetClientPortalPassword(input);
    return NextResponse.json({ reset: true });
  } catch (error) {
    return errorResponse(error);
  }
}
