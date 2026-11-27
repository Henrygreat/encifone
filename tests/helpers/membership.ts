import { prisma } from "@/lib/prisma";

/** ActiveMembership gained a required `membershipId` field (the
 * Membership row's own id, distinct from userId) once onboarding-step
 * fields needed to record "which staff member acted" against a
 * Membership relation. Test fixtures that hand-build an ActiveMembership
 * from a registerOwner()/inviteMember() result (which only return
 * {userId, organisationId}) need one extra lookup to fill it in. */
export async function membershipIdFor(userId: string, organisationId: string): Promise<string> {
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId, organisationId } });
  return membership.id;
}
