import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { listClientDocuments, requestDocumentUpload } from "@/modules/documents/service";
import { requestUploadSchema } from "@/modules/documents/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const portalSession = await requireActivePortalSession();
    const documents = await listClientDocuments({ portalSession }, portalSession.clientId);
    return NextResponse.json({ documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const portalSession = await requireActivePortalSession();
    const input = await parseJsonBody(request, requestUploadSchema);
    const result = await requestDocumentUpload({ portalSession }, portalSession.clientId, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
