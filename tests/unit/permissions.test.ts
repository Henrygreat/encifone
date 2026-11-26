import { describe, expect, it } from "vitest";
import { MembershipRole } from "@prisma/client";
import { Capability, roleHasCapability } from "@/core/permissions";

describe("roleHasCapability", () => {
  it("grants org management to owners and admins", () => {
    expect(roleHasCapability(MembershipRole.ORGANISATION_OWNER, Capability.ORG_MANAGE_MEMBERS)).toBe(
      true
    );
    expect(roleHasCapability(MembershipRole.ORGANISATION_ADMIN, Capability.ORG_MANAGE_MEMBERS)).toBe(
      true
    );
  });

  it("denies org management to a plain team member", () => {
    expect(roleHasCapability(MembershipRole.TEAM_MEMBER, Capability.ORG_MANAGE_MEMBERS)).toBe(false);
  });

  it("still allows a team member to view members", () => {
    expect(roleHasCapability(MembershipRole.TEAM_MEMBER, Capability.ORG_VIEW_MEMBERS)).toBe(true);
  });

  it("denies every capability to a client user", () => {
    expect(roleHasCapability(MembershipRole.CLIENT_USER, Capability.ORG_VIEW_MEMBERS)).toBe(false);
    expect(roleHasCapability(MembershipRole.CLIENT_USER, Capability.ORG_MANAGE_MEMBERS)).toBe(false);
    expect(roleHasCapability(MembershipRole.CLIENT_USER, Capability.ORG_UPDATE_SETTINGS)).toBe(false);
    expect(roleHasCapability(MembershipRole.CLIENT_USER, Capability.CRM_VIEW)).toBe(false);
  });

  it("grants sales roles CRM view and manage but not delete, except sales managers", () => {
    expect(roleHasCapability(MembershipRole.SALES_REPRESENTATIVE, Capability.CRM_VIEW)).toBe(true);
    expect(roleHasCapability(MembershipRole.SALES_REPRESENTATIVE, Capability.CRM_MANAGE)).toBe(true);
    expect(roleHasCapability(MembershipRole.SALES_REPRESENTATIVE, Capability.CRM_DELETE)).toBe(false);
    expect(roleHasCapability(MembershipRole.SALES_MANAGER, Capability.CRM_DELETE)).toBe(true);
  });

  it("grants a team member read-only CRM access", () => {
    expect(roleHasCapability(MembershipRole.TEAM_MEMBER, Capability.CRM_VIEW)).toBe(true);
    expect(roleHasCapability(MembershipRole.TEAM_MEMBER, Capability.CRM_MANAGE)).toBe(false);
  });
});
