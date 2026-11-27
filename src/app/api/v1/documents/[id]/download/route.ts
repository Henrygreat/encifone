import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { getDocumentDownloadUrl } from "@/modules/documents/service";
import { errorResponse } from "@/lib/api";

/** Returns a fresh, short-lived signed URL — never redirects straight to
 * a public bucket URL, and this JSON response itself is never cached by
 * the browser (a GET that has side-effect-free but time-limited output). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();
    const url = await getDocumentDownloadUrl({ acting }, id);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
