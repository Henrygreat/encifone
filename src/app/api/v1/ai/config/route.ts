import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getAIConfig, updateAIConfig } from "@/modules/ai/service";
import { updateAIConfigSchema } from "@/modules/ai/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const config = await getAIConfig(acting);
    return NextResponse.json(config);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateAIConfigSchema);
    const config = await updateAIConfig(acting, input);
    return NextResponse.json(config);
  } catch (error) {
    return errorResponse(error);
  }
}
