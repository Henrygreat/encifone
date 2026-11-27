import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { createDepartment, listDepartments } from "@/modules/workforce/service";
import { createDepartmentSchema } from "@/modules/workforce/schemas";

export async function GET() {
  try {
    const acting = await requireActiveMembership();
    const result = await listDepartments(acting);
    return NextResponse.json({ departments: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createDepartmentSchema);
    const result = await createDepartment(acting, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
