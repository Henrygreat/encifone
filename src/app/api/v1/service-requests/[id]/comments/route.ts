import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { addServiceRequestComment } from "@/modules/service-requests/service";

const schema = z.object({ body: z.string().trim().min(1).max(4000), isInternal: z.boolean().default(false) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, schema);
    const result = await addServiceRequestComment(acting, id, input.body, input.isInternal);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
