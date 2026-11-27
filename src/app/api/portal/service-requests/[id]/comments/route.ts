import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireActivePortalSession();
    const { id } = await params;
    const sr = await prisma.serviceRequest.findFirst({ where: { id, organisationId: session.organisationId, clientId: session.clientId } });
    if (!sr) return NextResponse.json({ error: "Service request not found." }, { status: 404 });

    const input = await parseJsonBody(request, schema);
    const comment = await prisma.serviceRequestComment.create({
      data: {
        serviceRequestId: id,
        authorPortalUserId: session.portalUserId,
        body: input.body,
        isInternal: false,
      },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
