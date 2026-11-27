import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { confirmDocumentUpload } from "@/modules/documents/service";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const portalSession = await requireActivePortalSession();
    const document = await confirmDocumentUpload({ portalSession }, id);
    return NextResponse.json(document);
  } catch (error) {
    return errorResponse(error);
  }
}
