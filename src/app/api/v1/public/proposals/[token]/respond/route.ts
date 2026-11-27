import { NextResponse } from "next/server";
import { z } from "zod";
import { respondToPublicProposal } from "@/modules/proposals/service";
import { errorResponse, ValidationError } from "@/lib/api";

const respondSchema = z.object({ response: z.enum(["ACCEPTED", "DECLINED"]) });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => null);
    const result = respondSchema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    const proposal = await respondToPublicProposal(token, result.data.response);
    return NextResponse.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
