import { prisma } from "@/lib/prisma";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";

export type ActionCentreSeverity = "info" | "warning" | "urgent";

export interface ActionCentreItem {
  id: string;
  type:
    | "OVERDUE_FOLLOW_UP"
    | "LEAD_AWAITING_CONTACT"
    | "STALLED_OPPORTUNITY"
    | "CLOSING_SOON"
    | "UNASSIGNED_TASK";
  severity: ActionCentreSeverity;
  title: string;
  detail: string;
  href: string;
}

const STALLED_DAYS = 14;
const CLOSING_SOON_DAYS = 7;

// No per-record detail pages exist yet (docs/CRM_USER_GUIDE.md §7) — an
// activity's "href" can only honestly point at the real list page for its
// entity type, never a dead link to a record page that doesn't exist.
const ENTITY_LIST_HREF: Record<string, string> = {
  CONTACT: "/contacts",
  COMPANY: "/companies",
  LEAD: "/leads",
  OPPORTUNITY: "/deals",
};

/**
 * Every item here is a real, tenant-scoped query result — "Needs Your
 * Attention" per the brief's §4.9. No AI provider involved, no invented
 * urgency; an empty array is a legitimate, honest result (rendered as an
 * empty state by the caller), not padded with filler.
 */
export async function getActionCentreItems(acting: ActiveMembership): Promise<ActionCentreItem[]> {
  if (!roleHasCapability(acting.role, Capability.CRM_VIEW)) {
    throw new ForbiddenError("You do not have permission to view this.");
  }

  const organisationId = acting.organisationId;
  const now = new Date();
  const stalledCutoff = new Date(now.getTime() - STALLED_DAYS * 24 * 60 * 60 * 1000);
  const closingSoonCutoff = new Date(now.getTime() + CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const [overdueTasks, newLeads, openOpportunities, unassignedTasks] = await Promise.all([
    prisma.activity.findMany({
      where: { organisationId, type: "TASK", status: "OPEN", dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.lead.findMany({
      where: { organisationId, deletedAt: null, status: "NEW" },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.opportunity.findMany({
      where: { organisationId, deletedAt: null, status: "OPEN" },
      include: { _count: { select: { activities: true } }, stage: { select: { name: true } } },
      orderBy: { updatedAt: "asc" },
      take: 30,
    }),
    prisma.activity.findMany({
      where: { organisationId, type: "TASK", status: "OPEN", ownerId: null },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const items: ActionCentreItem[] = [];

  for (const task of overdueTasks) {
    items.push({
      id: `overdue-${task.id}`,
      type: "OVERDUE_FOLLOW_UP",
      severity: "urgent",
      title: task.subject,
      detail: `Overdue since ${task.dueAt?.toLocaleDateString()}`,
      href: ENTITY_LIST_HREF[task.entityType] ?? "/dashboard",
    });
  }

  for (const lead of newLeads) {
    items.push({
      id: `lead-${lead.id}`,
      type: "LEAD_AWAITING_CONTACT",
      severity: "warning",
      title: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || "Unnamed lead",
      detail: "New lead, not yet contacted",
      href: `/leads`,
    });
  }

  // "Stalled" = no activity logged since the stalled cutoff, using the
  // opportunity's own updatedAt as a proxy — a real activity log entry
  // against it would bump updatedAt via its own writes in most flows, but
  // the stricter, honest signal is activity count combined with age.
  for (const opportunity of openOpportunities) {
    if (opportunity._count.activities === 0 && opportunity.updatedAt < stalledCutoff) {
      items.push({
        id: `stalled-${opportunity.id}`,
        type: "STALLED_OPPORTUNITY",
        severity: "warning",
        title: opportunity.name,
        detail: `No activity since ${opportunity.updatedAt.toLocaleDateString()} — still in ${opportunity.stage.name}`,
        href: `/deals`,
      });
    }
    if (opportunity.expectedCloseDate && opportunity.expectedCloseDate <= closingSoonCutoff && opportunity.expectedCloseDate >= now) {
      items.push({
        id: `closing-${opportunity.id}`,
        type: "CLOSING_SOON",
        severity: "info",
        title: opportunity.name,
        detail: `Expected to close ${opportunity.expectedCloseDate.toLocaleDateString()}`,
        href: `/deals`,
      });
    }
  }

  for (const task of unassignedTasks) {
    items.push({
      id: `unassigned-${task.id}`,
      type: "UNASSIGNED_TASK",
      severity: "info",
      title: task.subject,
      detail: "No owner assigned",
      href: ENTITY_LIST_HREF[task.entityType] ?? "/dashboard",
    });
  }

  return items;
}
