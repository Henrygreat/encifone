import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { archiveProject, getProject, updateProject } from "@/modules/projects/service";
import { updateProjectSchema } from "@/modules/projects/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const project = await getProject(acting, id);
    return NextResponse.json(project);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const input = await parseJsonBody(request, updateProjectSchema);
    const project = await updateProject(acting, id, input);
    return NextResponse.json(project);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acting = await requireActiveMembership();
    const { id } = await params;
    const project = await archiveProject(acting, id);
    return NextResponse.json(project);
  } catch (error) {
    return errorResponse(error);
  }
}
