import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import {
  createServiceCategory,
  listServiceCategories,
} from "@/modules/catalogue/service";
import {
  createServiceCategorySchema,
  listServiceCategoriesQuerySchema,
} from "@/modules/catalogue/schemas";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listServiceCategoriesQuerySchema);
    const categories = await listServiceCategories(acting, query);
    return NextResponse.json({ categories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createServiceCategorySchema);
    const category = await createServiceCategory(acting, input);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
