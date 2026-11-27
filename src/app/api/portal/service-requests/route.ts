import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

const schema = z.object({
  serviceItemId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  category: z.string().trim().max(120).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const items = await prisma.serviceRequest.findMany({
      where: { organisationId: session.organisationId, clientId: session.clientId },
      include: {
        comments: { where: { isInternal: false }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests: items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireActivePortalSession();
    const input = await parseJsonBody(request, schema);
    const created = await prisma.serviceRequest.create({
      data: {
        organisationId: session.organisationId,
        clientId: session.clientId,
        requesterPortalUserId: session.portalUserId,
        serviceItemId: input.serviceItemId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        urgency: input.urgency,
        status: "SUBMITTED",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
