import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireActivePortalSession } from "@/modules/portal/auth";

export async function GET() {
  try {
    const session = await requireActivePortalSession();
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        organisationId: session.organisationId,
        status: "PUBLISHED",
        isClientVisible: true,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        tags: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ articles });
  } catch (error) {
    return errorResponse(error);
  }
}
