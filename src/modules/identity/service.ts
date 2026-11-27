import crypto from "crypto";
import bcrypt from "bcryptjs";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import type { AcceptInviteInput, InviteMemberInput, RegisterInput, UpdateOrganisationSettingsInput } from "./schemas";

const PASSWORD_HASH_ROUNDS = 12;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 0;
  // Collisions are rare; a short bounded retry with a random suffix is enough.
  while (await prisma.organisation.findUnique({ where: { slug: candidate } })) {
    attempt += 1;
    candidate = `${base}-${crypto.randomBytes(3).toString("hex")}`;
    if (attempt > 10) {
      throw new Error("Could not generate a unique organisation slug.");
    }
  }
  return candidate;
}

/**
 * Registers a new owner and their organisation in one transaction. This is
 * the only path that creates an ORGANISATION_OWNER membership directly —
 * every other membership is created via `inviteMember`.
 */
export async function registerOwner(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
  const slug = await generateUniqueSlug(input.organisationName);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    const organisation = await tx.organisation.create({
      data: { name: input.organisationName, slug },
    });
    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        organisationId: organisation.id,
        role: MembershipRole.ORGANISATION_OWNER,
        status: MembershipStatus.ACTIVE,
        isDefault: true,
      },
    });
    return { user, organisation, membership };
  });

  await writeAuditLog({
    organisationId: result.organisation.id,
    actorUserId: result.user.id,
    action: "organisation.created",
    resourceType: "Organisation",
    resourceId: result.organisation.id,
  });
  await writeAuditLog({
    organisationId: result.organisation.id,
    actorUserId: result.user.id,
    action: "membership.created",
    resourceType: "Membership",
    resourceId: result.membership.id,
    metadata: { role: result.membership.role },
  });

  return { userId: result.user.id, organisationId: result.organisation.id };
}

/**
 * Creates a pending (status = INVITED) membership. No email is sent yet —
 * Phase 1 has no email provider wired up (see docs/MASTER_ROADMAP.md) — so the
 * invite link containing `inviteToken` must currently be shared out of band.
 */
export async function inviteMember(acting: ActiveMembership, input: InviteMemberInput) {
  if (!roleHasCapability(acting.role, Capability.ORG_MANAGE_MEMBERS)) {
    throw new ForbiddenError("You do not have permission to invite members to this organisation.");
  }

  const existingMembership = await prisma.membership.findFirst({
    where: { organisationId: acting.organisationId, user: { email: input.email } },
  });
  if (existingMembership) {
    throw new Error("This person is already a member of this organisation.");
  }

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: { email: input.email },
  });

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      organisationId: acting.organisationId,
      role: input.role,
      status: MembershipStatus.INVITED,
      inviteToken,
      invitedAt: new Date(),
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "membership.invited",
    resourceType: "Membership",
    resourceId: membership.id,
    metadata: { role: input.role, invitedEmail: input.email },
  });

  return { membershipId: membership.id, inviteToken };
}

export async function acceptInvite(input: AcceptInviteInput) {
  const membership = await prisma.membership.findUnique({ where: { inviteToken: input.token } });
  if (!membership || membership.status !== MembershipStatus.INVITED) {
    throw new Error("This invite link is invalid or has already been used.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: membership.userId },
      data: { passwordHash, ...(input.name ? { name: input.name } : {}) },
    }),
    prisma.membership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.ACTIVE, inviteToken: null },
    }),
  ]);

  await writeAuditLog({
    organisationId: membership.organisationId,
    actorUserId: membership.userId,
    action: "membership.invite_accepted",
    resourceType: "Membership",
    resourceId: membership.id,
  });

  return { userId: membership.userId, organisationId: membership.organisationId };
}

export async function listMembers(acting: ActiveMembership) {
  if (!roleHasCapability(acting.role, Capability.ORG_VIEW_MEMBERS)) {
    throw new ForbiddenError("You do not have permission to view members of this organisation.");
  }

  return prisma.membership.findMany({
    where: { organisationId: acting.organisationId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Lets an already-registered user spin up an additional organisation they
 * own, independent of the one created at registration. This is how a single
 * person ends up with multiple orgs to switch between (see docs/MASTER_ROADMAP.md
 * Phase 1 acceptance criteria) without needing a separate invite flow.
 */
export async function createOrganisationForExistingUser(userId: string, name: string) {
  const slug = await generateUniqueSlug(name);

  const result = await prisma.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({ data: { name, slug } });
    const membership = await tx.membership.create({
      data: {
        userId,
        organisationId: organisation.id,
        role: MembershipRole.ORGANISATION_OWNER,
        status: MembershipStatus.ACTIVE,
        isDefault: false,
      },
    });
    return { organisation, membership };
  });

  await writeAuditLog({
    organisationId: result.organisation.id,
    actorUserId: userId,
    action: "organisation.created",
    resourceType: "Organisation",
    resourceId: result.organisation.id,
  });

  return { organisationId: result.organisation.id, name: result.organisation.name };
}

export async function canSwitchToOrganisation(userId: string, organisationId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, organisationId, status: MembershipStatus.ACTIVE },
  });
  return Boolean(membership);
}

export async function getOrganisationSettings(acting: ActiveMembership) {
  if (!roleHasCapability(acting.role, Capability.ORG_VIEW_MEMBERS)) {
    throw new ForbiddenError("You do not have permission to view this organisation's settings.");
  }
  return prisma.organisation.findUniqueOrThrow({
    where: { id: acting.organisationId },
    select: {
      id: true,
      name: true,
      conversionRequiresContract: true,
      conversionRequiresPayment: true,
      autoStartOnboarding: true,
    },
  });
}

/**
 * The lead-to-client conversion gate (docs/MASTER_ROADMAP.md 2.7) — the
 * first real use of Capability.ORG_UPDATE_SETTINGS since it was modelled
 * in Phase 1 with no feature behind it yet.
 */
export async function updateOrganisationSettings(acting: ActiveMembership, input: UpdateOrganisationSettingsInput) {
  if (!roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)) {
    throw new ForbiddenError("You do not have permission to update this organisation's settings.");
  }

  const organisation = await prisma.organisation.update({
    where: { id: acting.organisationId },
    data: input,
    select: {
      id: true,
      name: true,
      conversionRequiresContract: true,
      conversionRequiresPayment: true,
      autoStartOnboarding: true,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "organisation.settings_updated",
    resourceType: "Organisation",
    resourceId: acting.organisationId,
    metadata: { fields: Object.keys(input) },
  });

  return organisation;
}
