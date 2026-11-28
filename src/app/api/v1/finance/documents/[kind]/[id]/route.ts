import { requireActiveMembership } from "@/core/tenancy";
import { financeErrorResponse } from "@/modules/finance/http";
import { renderSecondaryDocument } from "@/modules/finance/secondary-documents";

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params;
    const reference = new URL(request.url).searchParams.get("reference") ?? undefined;
    const pdf = await renderSecondaryDocument(await requireActiveMembership(), kind, id, reference);
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=${kind}.pdf`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
