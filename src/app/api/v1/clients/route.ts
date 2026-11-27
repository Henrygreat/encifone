import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createClient, listClients } from "@/modules/clients/service";
import { createClientSchema, listClientsQuerySchema } from "@/modules/clients/schemas";
import { parseJsonBody, parseQuery, errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listClientsQuerySchema);
    const result = await listClients(acting, query);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createClientSchema);
    const client = await createClient(acting, input);
    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
