import { financeErrorResponse } from "@/modules/finance/http";
import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { parseJsonBody } from "@/lib/api";
import { createRetainer, listRetainers } from "@/modules/finance/service";
import { createRetainerSchema } from "@/modules/finance/schemas";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const retainers = await listRetainers(acting);
    return NextResponse.json({ items: retainers });
  } catch (error) {
    return financeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createRetainerSchema);
    const retainer = await createRetainer(acting, input);
    return NextResponse.json(retainer, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
