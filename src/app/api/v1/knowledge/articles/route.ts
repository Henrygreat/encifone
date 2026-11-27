import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { createKnowledgeArticle, listKnowledgeArticles } from "@/modules/knowledge/service";
import { createArticleSchema, listArticlesQuerySchema } from "@/modules/knowledge/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listArticlesQuerySchema);
    const result = await listKnowledgeArticles(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createArticleSchema);
    const result = await createKnowledgeArticle(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
