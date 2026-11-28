import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { getInboxConversation, replySchema, replyToConversation, updateConversationSchema, updateInboxConversation } from "@/modules/inbox/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return Response.json(await getInboxConversation(await requireActiveMembership(), id, new URL(request.url).searchParams.get("before") ?? undefined));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await updateInboxConversation(await requireActiveMembership(), id, await parseJsonBody(request, updateConversationSchema));
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
    const { id } = await context.params;
    return Response.json(await replyToConversation(await requireActiveMembership(), id, await parseJsonBody(request, replySchema)), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
