import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { listUserMemberships, UnauthenticatedError } from "@/core/tenancy";
import { errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      throw new UnauthenticatedError();
    }
    const memberships = await listUserMemberships(session.user.id);
    return NextResponse.json({
      organisations: memberships.map((m) => ({
        organisationId: m.organisationId,
        name: m.organisation.name,
        slug: m.organisation.slug,
        role: m.role,
        isDefault: m.isDefault,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
