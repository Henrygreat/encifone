import { cookies } from "next/headers";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/auth";

export const ACTIVE_ORG_COOKIE = "clientos_active_org";

export class UnauthenticatedError extends Error {
  constructor(message = "You must be signed in to do this.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class NoActiveOrganisationError extends Error {
  constructor(message = "No active organisation membership found for this user.") {
    super(message);
    this.name = "NoActiveOrganisationError";
  }
}

export interface ActiveMembership {
  userId: string;
  organisationId: string;
  role: MembershipRole;
  // The Membership row's own id — distinct from userId. Needed wherever a
  // service writes "who acted" into a field that's typed as a Membership
  // relation (e.g. Client.ownerId, ClientOnboardingStep.completedByMembershipId),
  // not a User relation.
  membershipId: string;
}

/**
 * Resolves the authenticated user's active organisation server-side.
 *
 * The `activeOrgId` cookie is only ever used as a *lookup hint* — it is never
 * trusted as proof of membership. Every call re-verifies against the
 * Membership table that the signed-in user actually holds an ACTIVE
 * membership in that organisation before scoping any query to it. This is
 * the single choke point every API route and server component should go
 * through instead of trusting a client-supplied organisationId directly.
 * See docs/SECURITY.md §3.
 */
export async function requireActiveMembership(): Promise<ActiveMembership> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    throw new UnauthenticatedError();
  }

  const cookieStore = await cookies();
  const candidateOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const membership = candidateOrgId
    ? await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          organisationId: candidateOrgId,
          status: MembershipStatus.ACTIVE,
        },
      })
    : null;

  const resolved =
    membership ??
    (await prisma.membership.findFirst({
      where: { userId: session.user.id, status: MembershipStatus.ACTIVE },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }));

  if (!resolved) {
    throw new NoActiveOrganisationError();
  }

  return {
    userId: resolved.userId,
    organisationId: resolved.organisationId,
    role: resolved.role,
    membershipId: resolved.id,
  };
}

export async function listUserMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE },
    include: { organisation: true },
    orderBy: { createdAt: "asc" },
  });
}
