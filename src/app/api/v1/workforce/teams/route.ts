import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { createTeam, listTeams } from "@/modules/workforce/service";
import { createTeamSchema } from "@/modules/workforce/schemas";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const result = await listTeams(acting);
    return NextResponse.json({ teams: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createTeamSchema);
    const result = await createTeam(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
