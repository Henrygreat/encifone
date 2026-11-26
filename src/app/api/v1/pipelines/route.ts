import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { createPipeline, ensureDefaultPipeline, listPipelines } from "@/modules/sales/service";
import { createPipelineSchema } from "@/modules/sales/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

/** `?ensureDefault=true` returns the org's default pipeline, creating one
 * with a sensible default stage set if none exists yet — so the Kanban
 * board always has something to render on first load. */
export async function GET(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const ensureDefault = new URL(request.url).searchParams.get("ensureDefault") === "true";
    if (ensureDefault) {
      const pipeline = await ensureDefaultPipeline(acting);
      return NextResponse.json({ items: [pipeline] });
    }
    const pipelines = await listPipelines(acting);
    return NextResponse.json({ items: pipelines });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const acting = await requireActiveMembership();
    const input = await parseJsonBody(request, createPipelineSchema);
    const pipeline = await createPipeline(acting, input);
    return NextResponse.json(pipeline, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
