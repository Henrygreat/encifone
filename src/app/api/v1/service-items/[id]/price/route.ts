import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { updateServiceItemPrice } from "@/modules/catalogue/service";
import { updateServiceItemPriceSchema } from "@/modules/catalogue/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, updateServiceItemPriceSchema);
    const item = await updateServiceItemPrice(acting, id, input);
    return NextResponse.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}
