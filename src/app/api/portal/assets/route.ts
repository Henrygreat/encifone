import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const assets = await prisma.asset.findMany({
      where: {
        organisationId: session.organisationId,
        clientId: session.clientId,
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ assets });
  } catch (error) {
    return errorResponse(error);
  }
}
