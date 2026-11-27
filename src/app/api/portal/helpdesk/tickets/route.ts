import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

const createSchema = z.object({
  serviceRequestId: z.string().cuid().optional(),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  category: z.string().trim().max(120).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const tickets = await prisma.helpdeskTicket.findMany({
      where: { organisationId: session.organisationId, clientId: session.clientId },
      include: { comments: { where: { isInternal: false }, orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireActivePortalSession();
    const input = await parseJsonBody(request, createSchema);
    const count = await prisma.helpdeskTicket.count({ where: { organisationId: session.organisationId } });
    const created = await prisma.helpdeskTicket.create({
      data: {
        organisationId: session.organisationId,
        clientId: session.clientId,
        serviceRequestId: input.serviceRequestId,
        reference: `TKT-${String(count + 1).padStart(6, "0")}`,
        subject: input.subject,
        description: input.description,
        category: input.category,
        priority: input.priority,
        severity: input.severity,
        status: "OPEN",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
