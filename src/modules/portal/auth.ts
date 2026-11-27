import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { ClientPortalUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, roleHasCapability, ForbiddenError } from "@/core/permissions";
import { UnauthenticatedError, type ActiveMembership } from "@/core/tenancy";
import { env } from "@/lib/env";

/**
 * A client-portal principal is deliberately NOT a `User`/`Membership` row
 * (see prisma/schema.prisma's comment above ClientPortalUser) — it never
 * gets a NextAuth session. This is a separate, minimal session mechanism:
 * only a session token's SHA-256 hash is ever stored (ClientPortalSession.tokenHash),
 * so a database-only read (backup, replica, admin query) can never yield a
 * usable session — the same reasoning src/lib/crypto.ts already applies to
 * why API keys are encrypted rather than kept plaintext.
 */
export const PORTAL_SESSION_COOKIE = "clientos_portal_session";
const PASSWORD_HASH_ROUNDS = 12;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

export class PortalUnauthenticatedError extends UnauthenticatedError {
  constructor(message = "You must be signed in to the client portal to do this.") {
    super(message);
    this.name = "PortalUnauthenticatedError";
  }
}

export interface ActivePortalSession {
  portalUserId: string;
  clientId: string;
  organisationId: string;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function requirePortalManage(acting: ActiveMembership) {
  if (!roleHasCapability(acting.role, Capability.PORTAL_MANAGE)) {
    throw new ForbiddenError("You do not have permission to manage the client portal.");
  }
}

/**
 * Invites a client contact to the portal for a specific Client record.
 * Verifies the client belongs to the acting membership's organisation
 * before creating anything — never trusts a clientId pairing implicitly.
 * Returns the raw invite token/URL for the caller to share — no email
 * delivery exists in this project (same limitation as the internal
 * Membership invite flow), so this is returned directly rather than
 * claimed as sent.
 */
export async function inviteClientPortalUser(
  acting: ActiveMembership,
  input: { clientId: string; email: string; name?: string }
) {
  await requirePortalManage(acting);

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!client) {
    throw new Error("Client not found in this organisation.");
  }

  const email = input.email.toLowerCase();
  const existingByEmail = await prisma.clientPortalUser.findUnique({ where: { email } });
  if (existingByEmail && existingByEmail.clientId !== input.clientId) {
    throw new Error("This email is already a portal user for a different client.");
  }
  if (existingByEmail?.status === ClientPortalUserStatus.ACTIVE) {
    throw new Error("This person already has active portal access.");
  }

  const portalUser = existingByEmail
    ? await prisma.clientPortalUser.update({
        where: { id: existingByEmail.id },
        data: { status: ClientPortalUserStatus.INVITED, invitedAt: new Date(), name: input.name ?? existingByEmail.name },
      })
    : await prisma.clientPortalUser.create({
        data: {
          organisationId: acting.organisationId,
          clientId: input.clientId,
          email,
          name: input.name,
          status: ClientPortalUserStatus.INVITED,
          invitedAt: new Date(),
        },
      });

  const token = crypto.randomBytes(24).toString("hex");
  await prisma.clientPortalInvite.create({
    data: { clientPortalUserId: portalUser.id, token, expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS) },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "portal_user.invited",
    resourceType: "ClientPortalUser",
    resourceId: portalUser.id,
    metadata: { clientId: input.clientId, invitedEmail: email },
  });

  return { portalUser, inviteUrl: `${env.APP_URL}/portal/accept-invite?token=${token}` };
}

export async function acceptClientPortalInvite(input: { token: string; password: string; name?: string }) {
  const invite = await prisma.clientPortalInvite.findUnique({ where: { token: input.token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new Error("This invite link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

  const portalUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.clientPortalUser.update({
      where: { id: invite.clientPortalUserId },
      data: { passwordHash, status: ClientPortalUserStatus.ACTIVE, ...(input.name ? { name: input.name } : {}) },
    });
    await tx.clientPortalInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return updated;
  });

  await writeAuditLog({
    organisationId: portalUser.organisationId,
    actorUserId: null,
    action: "portal_user.invite_accepted",
    resourceType: "ClientPortalUser",
    resourceId: portalUser.id,
    metadata: { portalUserId: portalUser.id },
  });

  return createPortalSessionCookie(portalUser.id);
}

export async function loginPortalUser(email: string, password: string) {
  const portalUser = await prisma.clientPortalUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!portalUser?.passwordHash || portalUser.status !== ClientPortalUserStatus.ACTIVE) {
    throw new Error("Invalid email or password.");
  }

  const isValid = await bcrypt.compare(password, portalUser.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password.");
  }

  await prisma.clientPortalUser.update({ where: { id: portalUser.id }, data: { lastLoginAt: new Date() } });
  return createPortalSessionCookie(portalUser.id);
}

/**
 * Creates a one-time reset token for an active portal user.
 * Always returns a generic success shape so callers don't leak whether
 * a specific email exists.
 */
export async function requestClientPortalPasswordReset(email: string) {
  const portalUser = await prisma.clientPortalUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!portalUser || portalUser.status !== ClientPortalUserStatus.ACTIVE || !portalUser.passwordHash) {
    return { requested: true } as const;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  await prisma.$transaction([
    prisma.clientPortalPasswordResetToken.deleteMany({ where: { clientPortalUserId: portalUser.id, usedAt: null } }),
    prisma.clientPortalPasswordResetToken.create({
      data: {
        clientPortalUserId: portalUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
      },
    }),
  ]);

  await writeAuditLog({
    organisationId: portalUser.organisationId,
    actorUserId: null,
    action: "portal_user.password_reset_requested",
    resourceType: "ClientPortalUser",
    resourceId: portalUser.id,
  });

  return {
    requested: true,
    // With no email delivery wired yet, non-production can surface the URL
    // so teams can complete recovery manually while preserving production secrecy.
    resetUrl:
      process.env.NODE_ENV === "production"
        ? undefined
        : `${env.APP_URL}/portal/reset-password?token=${rawToken}`,
  } as const;
}

export async function resetClientPortalPassword(input: { token: string; password: string }) {
  const tokenHash = hashToken(input.token);
  const reset = await prisma.clientPortalPasswordResetToken.findUnique({
    where: { tokenHash },
    include: { clientPortalUser: true },
  });

  if (
    !reset ||
    reset.usedAt ||
    reset.expiresAt < new Date() ||
    reset.clientPortalUser.status !== ClientPortalUserStatus.ACTIVE
  ) {
    throw new Error("This password reset link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
  await prisma.$transaction([
    prisma.clientPortalUser.update({
      where: { id: reset.clientPortalUserId },
      data: { passwordHash, lastLoginAt: new Date() },
    }),
    prisma.clientPortalPasswordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.clientPortalPasswordResetToken.deleteMany({ where: { clientPortalUserId: reset.clientPortalUserId, usedAt: null } }),
    // Resetting password immediately invalidates all existing sessions.
    prisma.clientPortalSession.deleteMany({ where: { clientPortalUserId: reset.clientPortalUserId } }),
  ]);

  await writeAuditLog({
    organisationId: reset.clientPortalUser.organisationId,
    actorUserId: null,
    action: "portal_user.password_reset_completed",
    resourceType: "ClientPortalUser",
    resourceId: reset.clientPortalUserId,
  });

  return createPortalSessionCookie(reset.clientPortalUserId);
}

/** Creates a session row (storing only its hash) and sets the httpOnly
 * session cookie on the current response — the raw token never touches
 * any database column or log line. */
async function createPortalSessionCookie(portalUserId: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
  await prisma.clientPortalSession.create({
    data: { clientPortalUserId: portalUserId, tokenHash: hashToken(rawToken), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return portalUserId;
}

/**
 * The single choke point every portal page/API route must go through —
 * mirrors requireActiveMembership()'s role for internal staff. The
 * resulting clientId/organisationId come only from the verified session
 * row, never from a URL param or request body, so a portal route has no
 * client-controllable identifier to manipulate in the first place.
 */
export async function requireActivePortalSession(): Promise<ActivePortalSession> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!rawToken) {
    throw new PortalUnauthenticatedError();
  }

  const session = await prisma.clientPortalSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { clientPortalUser: true },
  });

  if (!session || session.expiresAt < new Date() || session.clientPortalUser.status !== ClientPortalUserStatus.ACTIVE) {
    throw new PortalUnauthenticatedError();
  }

  // Best-effort activity timestamp — never blocks the request if it fails.
  prisma.clientPortalSession
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return {
    portalUserId: session.clientPortalUserId,
    clientId: session.clientPortalUser.clientId,
    organisationId: session.clientPortalUser.organisationId,
  };
}

export async function destroyPortalSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (rawToken) {
    await prisma.clientPortalSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }
  cookieStore.delete(PORTAL_SESSION_COOKIE);
}

/** Internal-side control: disable a portal user and immediately invalidate
 * every session they currently hold (not just block future logins). */
export async function disableClientPortalUser(acting: ActiveMembership, portalUserId: string) {
  await requirePortalManage(acting);

  const portalUser = await prisma.clientPortalUser.findFirst({
    where: { id: portalUserId, organisationId: acting.organisationId },
  });
  if (!portalUser) {
    throw new Error("Portal user not found in this organisation.");
  }

  await prisma.$transaction([
    prisma.clientPortalUser.update({ where: { id: portalUserId }, data: { status: ClientPortalUserStatus.DISABLED } }),
    prisma.clientPortalSession.deleteMany({ where: { clientPortalUserId: portalUserId } }),
  ]);

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "portal_user.disabled",
    resourceType: "ClientPortalUser",
    resourceId: portalUserId,
  });
}

export async function listClientPortalUsers(acting: ActiveMembership, clientId: string) {
  if (!roleHasCapability(acting.role, Capability.PORTAL_VIEW)) {
    throw new ForbiddenError("You do not have permission to view portal access for this client.");
  }
  return prisma.clientPortalUser.findMany({
    where: { clientId, organisationId: acting.organisationId },
    orderBy: { createdAt: "asc" },
  });
}

/** The portal's own "/me" — resolved entirely from the verified session,
 * never a client-supplied id. Organisation.branding (logo/colour
 * overrides, docs/DESIGN_SYSTEM.md §6) is surfaced here so the portal
 * shell can white-label itself; internal-only fields (notes, owner,
 * tags) are deliberately absent from this shape. */
export async function getPortalProfile(session: ActivePortalSession) {
  const [portalUser, client, organisation] = await Promise.all([
    prisma.clientPortalUser.findUniqueOrThrow({ where: { id: session.portalUserId } }),
    prisma.client.findUniqueOrThrow({ where: { id: session.clientId } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: session.organisationId } }),
  ]);

  return {
    email: portalUser.email,
    name: portalUser.name,
    client: { id: client.id, name: client.name },
    organisation: { name: organisation.name, branding: organisation.branding },
  };
}
