import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { appointmentRange, appointmentSchema, listAppointments, saveAppointment } from "@/modules/inbox/appointments";

export async function GET(request: Request) {
  try { return Response.json(await listAppointments(await requireActiveMembership(), parseQuery(request, appointmentRange))); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
    return Response.json(await saveAppointment(await requireActiveMembership(), await parseJsonBody(request, appointmentSchema)), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
