import { MembershipRole } from "@prisma/client";

/**
 * Phase 1 capability set. This grows module-by-module (see docs/ROADMAP.md) —
 * it is deliberately not pre-populated with capabilities for modules that
 * don't exist yet.
 */
export enum Capability {
  ORG_VIEW_MEMBERS = "org:view_members",
  ORG_MANAGE_MEMBERS = "org:manage_members",
  ORG_UPDATE_SETTINGS = "org:update_settings",
}

const ROLE_CAPABILITIES: Record<MembershipRole, Capability[]> = {
  PLATFORM_SUPER_ADMIN: Object.values(Capability),
  ORGANISATION_OWNER: Object.values(Capability),
  ORGANISATION_ADMIN: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.ORG_MANAGE_MEMBERS,
    Capability.ORG_UPDATE_SETTINGS,
  ],
  OPERATIONS_MANAGER: [Capability.ORG_VIEW_MEMBERS],
  SALES_MANAGER: [Capability.ORG_VIEW_MEMBERS],
  SALES_REPRESENTATIVE: [Capability.ORG_VIEW_MEMBERS],
  ACCOUNT_MANAGER: [Capability.ORG_VIEW_MEMBERS],
  FINANCE_MANAGER: [Capability.ORG_VIEW_MEMBERS],
  PROJECT_MANAGER: [Capability.ORG_VIEW_MEMBERS],
  TEAM_MEMBER: [Capability.ORG_VIEW_MEMBERS],
  CONTRACTOR: [],
  CLIENT_ADMINISTRATOR: [],
  CLIENT_USER: [],
  READ_ONLY_AUDITOR: [Capability.ORG_VIEW_MEMBERS],
};

export function roleHasCapability(role: MembershipRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
