import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerAuthSession } from "@/lib/auth";
import { ACTIVE_ORG_COOKIE, UnauthenticatedError } from "@/core/tenancy";
import { canSwitchToOrganisation } from "@/modules/identity/service";
import { switchOrganisationSchema } from "@/modules/identity/schemas";
import { parseJsonBody, errorResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      throw new UnauthenticatedError();
    }

    const { organisationId } = await parseJsonBody(request, switchOrganisationSchema);

    // Re-verify server-side that this user actually holds an active
    // membership in the requested org before trusting it for anything —
    // never take the client's word for which org it may switch into.
    const allowed = await canSwitchToOrganisation(session.user.id, organisationId);
    if (!allowed) {
      return NextResponse.json(
        { error: "You are not an active member of that organisation." },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, organisationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ organisationId });
  } catch (error) {
    return errorResponse(error);
  }
}
