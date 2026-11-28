import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { AppointmentCalendar } from "./appointments";
import { TaskDueDates } from "./task-due-dates";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const acting = await requireActiveMembership();
  const canManage = roleHasCapability(acting.role, Capability.INBOX_MANAGE);
  const conversation = (await searchParams).conversation;
  const linked = canManage && typeof conversation === "string" && conversation ? await prisma.inboxConversation.findFirst({
    where: { id: conversation, organisationId: acting.organisationId }, select: { id: true },
  }) : null;
  return <div className="space-y-5 p-4 sm:p-6">
    <PageHeader title="Calendar" description="View appointments and upcoming task due dates." />
    {roleHasCapability(acting.role, Capability.INBOX_VIEW) &&
      <AppointmentCalendar scope={acting.organisationId} conversationId={linked?.id} canManage={canManage} />}
    <TaskDueDates />
  </div>;
}
