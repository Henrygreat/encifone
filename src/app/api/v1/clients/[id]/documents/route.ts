import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { listClientDocuments, requestDocumentUpload } from "@/modules/documents/service";
import { requestUploadSchema } from "@/modules/documents/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const documents = await listClientDocuments({ acting }, id);
    return NextResponse.json({ documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, requestUploadSchema);
    const result = await requestDocumentUpload({ acting }, id, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
