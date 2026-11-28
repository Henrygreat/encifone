import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { assistantSchema, suggestCommunication } from "@/modules/inbox/assistant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
    const acting = await requireActiveMembership();
    return Response.json(await suggestCommunication(acting, (await params).id, await parseJsonBody(request, assistantSchema)),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
