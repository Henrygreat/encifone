import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const projects = await prisma.project.findMany({
      where: {
        organisationId: session.organisationId,
        clientId: session.clientId,
        isClientVisible: true,
        archivedAt: null,
      },
      include: {
        milestones: {
          where: { isClientVisible: true },
          orderBy: [{ dueDate: "asc" }],
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return errorResponse(error);
  }
}
