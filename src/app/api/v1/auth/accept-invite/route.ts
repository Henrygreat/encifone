import { NextResponse } from "next/server";
import { acceptInvite } from "@/modules/identity/service";
import { acceptInviteSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, acceptInviteSchema);
    const result = await acceptInvite(input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
