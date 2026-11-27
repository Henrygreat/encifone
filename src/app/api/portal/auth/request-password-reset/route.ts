import { NextResponse } from "next/server";
import { requestClientPortalPasswordReset } from "@/modules/portal/auth";
import { requestPortalPasswordResetSchema } from "@/modules/portal/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    await checkRateLimit(`portal-request-password-reset:${clientIpFrom(request)}`, 20, 300);
    const { email } = await parseJsonBody(request, requestPortalPasswordResetSchema);
    const result = await requestClientPortalPasswordReset(email);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
