import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { updateKnowledgeArticle } from "@/modules/knowledge/service";
import { updateArticleSchema } from "@/modules/knowledge/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateArticleSchema);
    const result = await updateKnowledgeArticle(acting, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
