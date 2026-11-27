import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { setServiceDependencies } from "@/modules/catalogue/service";
import { setServiceDependenciesSchema } from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, setServiceDependenciesSchema);
    const item = await setServiceDependencies(acting, id, input);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}
