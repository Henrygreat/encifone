import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { archiveTask, updateTask } from "@/modules/tasks/service";
import { updateTaskSchema } from "@/modules/tasks/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateTaskSchema);
    const task = await updateTask(acting, id, input);
    return NextResponse.json(task);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const task = await archiveTask(acting, id);
    return NextResponse.json(task);
  } catch (error) {
    return errorResponse(error);
  }
}
