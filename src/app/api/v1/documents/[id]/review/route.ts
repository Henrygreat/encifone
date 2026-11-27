import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { reviewDocument } from "@/modules/documents/service";
import { reviewDocumentSchema } from "@/modules/documents/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const { decision } = await parseJsonBody(request, reviewDocumentSchema);
    const document = await reviewDocument(acting, id, decision);
    return NextResponse.json(document);
  } catch (error) {
    return errorResponse(error);
  }
}
