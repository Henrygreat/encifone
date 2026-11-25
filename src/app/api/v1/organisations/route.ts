import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { UnauthenticatedError } from "@/core/tenancy";
import { createOrganisationForExistingUser } from "@/modules/identity/service";
import { createOrganisationSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      throw new UnauthenticatedError();
    }
    const { name } = await parseJsonBody(request, createOrganisationSchema);
    const result = await createOrganisationForExistingUser(session.user.id, name);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
