import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { confirmDocumentUpload } from "@/modules/documents/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const document = await confirmDocumentUpload({ acting }, id);
    return NextResponse.json(document);
  } catch (error) {
    return errorResponse(error);
  }
}
