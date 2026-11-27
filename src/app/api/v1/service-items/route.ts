import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createServiceItem, listServiceItems } from "@/modules/catalogue/service";
import { createServiceItemSchema, listServiceItemsQuerySchema } from "@/modules/catalogue/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listServiceItemsQuerySchema);
    const result = await listServiceItems(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createServiceItemSchema);
    const item = await createServiceItem(acting, input);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
