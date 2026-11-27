import { NextResponse } from "next/server";
import { requireActivePortalSession } from "@/modules/portal/auth";
import { getDocumentDownloadUrl } from "@/modules/documents/service";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const portalSession = await requireActivePortalSession();
    const url = await getDocumentDownloadUrl({ portalSession }, id);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
