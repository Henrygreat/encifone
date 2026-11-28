import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { appointmentSchema, cancelAppointment, saveAppointment } from "@/modules/inbox/appointments";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  try { return Response.json(await saveAppointment(await requireActiveMembership(), await parseJsonBody(request, appointmentSchema), (await params).id)); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    await cancelAppointment(await requireActiveMembership(), (await params).id);
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
