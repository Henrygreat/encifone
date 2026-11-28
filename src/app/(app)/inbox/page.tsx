import { notFound } from "next/navigation";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { InboxWorkspace } from "./workspace";

export default async function InboxPage() {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.INBOX_VIEW)) notFound();
  const canManage = roleHasCapability(acting.role, Capability.INBOX_MANAGE);
  const members = canManage ? await prisma.membership.findMany({
    where: { organisationId: acting.organisationId, status: "ACTIVE" },
    select: { id: true, user: { select: { name: true } } },
  }) : [];
  return <InboxWorkspace key={acting.organisationId} scope={acting.organisationId} canManage={canManage}
    canConfigure={roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)} members={members} />;
}
