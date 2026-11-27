import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { createKnowledgeCategory, listKnowledgeCategories } from "@/modules/knowledge/service";
import { createCategorySchema } from "@/modules/knowledge/schemas";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const result = await listKnowledgeCategories(acting);
    return NextResponse.json({ categories: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createCategorySchema);
    const result = await createKnowledgeCategory(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
