import { NextResponse } from "next/server";
import { registerOwner } from "@/modules/identity/service";
import { registerSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, registerSchema);
    const result = await registerOwner(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
