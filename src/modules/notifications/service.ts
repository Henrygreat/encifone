import { NotificationRecipientType, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import type { ActivePortalSession } from "@/modules/portal/auth";

/**
 * In-app only — no email/SMS delivery exists in this project (see "Known
 * limitations" in docs/IMPLEMENTATION_STATUS.md). A Notification row is
 * never presented as "sent" to its recipient outside the app itself.
 */
export async function notifyMembership(input: {
  organisationId: string;
  membershipId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}) {
  return prisma.notification.create({
    data: {
      organisationId: input.organisationId,
      recipientType: NotificationRecipientType.MEMBERSHIP,
      recipientMembershipId: input.membershipId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
}

export async function notifyPortalUser(input: {
  organisationId: string;
  portalUserId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}) {
  return prisma.notification.create({
    data: {
      organisationId: input.organisationId,
      recipientType: NotificationRecipientType.CLIENT_PORTAL_USER,
      recipientPortalUserId: input.portalUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
}

export async function listNotificationsForMembership(acting: ActiveMembership, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      organisationId: acting.organisationId,
      recipientType: NotificationRecipientType.MEMBERSHIP,
      recipientMembershipId: acting.membershipId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listNotificationsForPortalUser(portalSession: ActivePortalSession, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      organisationId: portalSession.organisationId,
      recipientType: NotificationRecipientType.CLIENT_PORTAL_USER,
      recipientPortalUserId: portalSession.portalUserId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Marking read is scoped to the caller's own notifications only — the
 * where-clause is the isolation check, not a separate lookup-then-check. */
export async function markNotificationRead(recipientMembershipId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientMembershipId },
    data: { readAt: new Date() },
  });
}

export async function markPortalNotificationRead(recipientPortalUserId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientPortalUserId },
    data: { readAt: new Date() },
  });
}
