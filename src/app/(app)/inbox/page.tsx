import { notFound } from "next/navigation";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { InboxWorkspace } from "./workspace";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.INBOX_VIEW)) notFound();
  const canManage = roleHasCapability(acting.role, Capability.INBOX_MANAGE);
  const requestId = (await searchParams).conversation;
  const selected = typeof requestId === "string" && requestId ? await prisma.inboxConversation.findFirst({
    where: { id: requestId, organisationId: acting.organisationId }, select: { id: true },
  }) : null;
  const members = canManage ? await prisma.membership.findMany({
    where: { organisationId: acting.organisationId, status: "ACTIVE" },
    select: { id: true, user: { select: { name: true } } },
  }) : [];
  return <InboxWorkspace key={`${acting.organisationId}:${selected?.id ?? ""}`} initial={selected?.id} scope={acting.organisationId} canManage={canManage}
    canConfigure={roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)} members={members} />;
}
