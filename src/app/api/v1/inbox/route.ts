import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseQuery } from "@/lib/api";
import { inboxFilterSchema, listInbox } from "@/modules/inbox/service";

export async function GET(request: Request) {
  try {
    return Response.json(await listInbox(await requireActiveMembership(), parseQuery(request, inboxFilterSchema)));
  } catch (error) { return errorResponse(error); }
}
