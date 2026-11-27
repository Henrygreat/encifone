import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { createTask, listTasks } from "@/modules/tasks/service";
import { createTaskSchema, listTasksQuerySchema } from "@/modules/tasks/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listTasksQuerySchema);
    const tasks = await listTasks(acting, query);
    return NextResponse.json(tasks);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createTaskSchema);
    const task = await createTask(acting, input);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
