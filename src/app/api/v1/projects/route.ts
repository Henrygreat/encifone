import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody, parseQuery } from "@/lib/api";
import { createProject, listProjects } from "@/modules/projects/service";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/schemas";

export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const query = parseQuery(request, listProjectsQuerySchema);
    const projects = await listProjects(acting, query);
    return NextResponse.json(projects);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createProjectSchema);
    const project = await createProject(acting, input);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
