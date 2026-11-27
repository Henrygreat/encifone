import { MembershipRole } from "@prisma/client";

/**
 * Phase 1 capability set. This grows module-by-module (see docs/MASTER_ROADMAP.md) —
 * it is deliberately not pre-populated with capabilities for modules that
 * don't exist yet.
 */
export enum Capability {
  ORG_VIEW_MEMBERS = "org:view_members",
  ORG_MANAGE_MEMBERS = "org:manage_members",
  ORG_UPDATE_SETTINGS = "org:update_settings",
  // Phase 2A — CRM & sales core (docs/MASTER_ROADMAP.md "Phase 2A").
  // VIEW covers read access to contacts/companies/leads/opportunities/
  // activities; MANAGE covers create/update/archive/reassign-ownership;
  // DELETE is split out separately since a hard delete (vs. the default
  // soft-delete via deletedAt) is a step more destructive than ordinary
  // editing and some roles that can manage records shouldn't necessarily
  // be able to permanently remove them.
  CRM_VIEW = "crm:view",
  CRM_MANAGE = "crm:manage",
  CRM_DELETE = "crm:delete",
  // Phase 3 — Client Portal + Onboarding. VIEW covers reading onboarding
  // progress/documents/portal-user status for a client; MANAGE covers
  // inviting/disabling portal users, creating/editing onboarding
  // templates, starting an onboarding, and approving/rejecting a
  // submitted document — all more consequential than read access, same
  // split rationale as CRM_MANAGE vs CRM_VIEW.
  PORTAL_VIEW = "portal:view",
  PORTAL_MANAGE = "portal:manage",
}

const ROLE_CAPABILITIES: Record<MembershipRole, Capability[]> = {
  PLATFORM_SUPER_ADMIN: Object.values(Capability),
  ORGANISATION_OWNER: Object.values(Capability),
  ORGANISATION_ADMIN: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.ORG_MANAGE_MEMBERS,
    Capability.ORG_UPDATE_SETTINGS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.CRM_DELETE,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
  ],
  OPERATIONS_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
  ],
  SALES_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.CRM_DELETE,
    Capability.PORTAL_VIEW,
  ],
  SALES_REPRESENTATIVE: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
  ],
  ACCOUNT_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
  ],
  FINANCE_MANAGER: [Capability.ORG_VIEW_MEMBERS, Capability.CRM_VIEW, Capability.PORTAL_VIEW],
  PROJECT_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
  ],
  TEAM_MEMBER: [Capability.ORG_VIEW_MEMBERS, Capability.CRM_VIEW, Capability.PORTAL_VIEW],
  CONTRACTOR: [],
  CLIENT_ADMINISTRATOR: [],
  CLIENT_USER: [],
  READ_ONLY_AUDITOR: [Capability.ORG_VIEW_MEMBERS, Capability.CRM_VIEW, Capability.PORTAL_VIEW],
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
