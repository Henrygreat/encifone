import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import {
  acceptInvite,
  canSwitchToOrganisation,
  inviteMember,
  listMembers,
  registerOwner,
} from "@/modules/identity/service";
import { membershipIdFor } from "../helpers/membership";

/**
 * Exercises the actual enforcement points behind every tenant-scoped API
 * route (docs/SECURITY.md §3): service functions never accept an
 * organisationId from a caller directly — they only ever trust an
 * `ActiveMembership` that `requireActiveMembership()` has already verified.
 * These tests prove that verification actually rejects cross-org access,
 * against a real database rather than mocks.
 */

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

let orgAOwner: { userId: string; organisationId: string };
let orgBOwner: { userId: string; organisationId: string };
let actingAsOrgAOwner: ActiveMembership;
let actingAsOrgBOwner: ActiveMembership;

beforeAll(async () => {
  orgAOwner = await registerOwner({
    name: "Org A Owner",
    email: uniqueEmail("owner-a"),
    password: "password123",
    organisationName: `Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Org B Owner",
    email: uniqueEmail("owner-b"),
    password: "password123",
    organisationName: `Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgAOwner.userId, orgAOwner.organisationId),
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgBOwner.userId, orgBOwner.organisationId),
  };
});

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("cross-org membership checks", () => {
  it("allows a user to switch into an organisation they belong to", async () => {
    await expect(canSwitchToOrganisation(orgAOwner.userId, orgAOwner.organisationId)).resolves.toBe(
      true
    );
  });

  it("rejects switching into an organisation the user does not belong to", async () => {
    await expect(canSwitchToOrganisation(orgAOwner.userId, orgBOwner.organisationId)).resolves.toBe(
      false
    );
  });
});

describe("listMembers tenant scoping", () => {
  it("never returns another organisation's members", async () => {
    const orgAMembers = await listMembers(actingAsOrgAOwner);
    const orgBMembers = await listMembers(actingAsOrgBOwner);

    expect(orgAMembers.every((m) => m.organisationId === orgAOwner.organisationId)).toBe(true);
    expect(orgBMembers.every((m) => m.organisationId === orgBOwner.organisationId)).toBe(true);
    expect(orgAMembers.some((m) => m.userId === orgBOwner.userId)).toBe(false);
    expect(orgBMembers.some((m) => m.userId === orgAOwner.userId)).toBe(false);
  });
});

describe("invite permission enforcement", () => {
  it("rejects inviting when the acting role lacks the capability", async () => {
    const actingAsTeamMember: ActiveMembership = {
      userId: orgAOwner.userId,
      organisationId: orgAOwner.organisationId,
      role: "TEAM_MEMBER",
      membershipId: await membershipIdFor(orgAOwner.userId, orgAOwner.organisationId),
    };

    await expect(
      inviteMember(actingAsTeamMember, { email: uniqueEmail("invitee"), role: "TEAM_MEMBER" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an owner invite a member and the invite activates on accept", async () => {
    const inviteeEmail = uniqueEmail("invitee");
    const { inviteToken } = await inviteMember(actingAsOrgAOwner, {
      email: inviteeEmail,
      role: "TEAM_MEMBER",
    });

    const { userId, organisationId } = await acceptInvite({
      token: inviteToken,
      name: "Invited Member",
      password: "password123",
    });
    createdUserIds.push(userId);

    expect(organisationId).toBe(orgAOwner.organisationId);

    const membership = await prisma.membership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    });
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.role).toBe("TEAM_MEMBER");

    const orgAMembers = await listMembers(actingAsOrgAOwner);
    expect(orgAMembers.some((m) => m.userId === userId)).toBe(true);

    const orgBMembers = await listMembers(actingAsOrgBOwner);
    expect(orgBMembers.some((m) => m.userId === userId)).toBe(false);
  });
});
