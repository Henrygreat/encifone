import { NextResponse } from "next/server";
import { requireActiveMembership } from "@/core/tenancy";
import { convertLead } from "@/modules/crm/service";
import { convertLeadSchema } from "@/modules/crm/schemas";
import { ValidationError, errorResponse } from "@/lib/api";

/** Body is optional — converting with no overrides is the common case
 * (derive Company/Contact from the lead's own free-text fields). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acting = await requireActiveMembership();

    const rawBody = await request.text();
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const result = convertLeadSchema.safeParse(parsedBody);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }

    const converted = await convertLead(acting, id, result.data);
    return NextResponse.json(converted);
  } catch (error) {
    return errorResponse(error);
  }
}
