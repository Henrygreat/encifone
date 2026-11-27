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
  PROJECT_VIEW = "project:view",
  PROJECT_MANAGE = "project:manage",
  TASK_VIEW = "task:view",
  TASK_MANAGE = "task:manage",
  WORKFORCE_VIEW = "workforce:view",
  WORKFORCE_MANAGE = "workforce:manage",
  SERVICE_REQUEST_VIEW = "service_request:view",
  SERVICE_REQUEST_MANAGE = "service_request:manage",
  HELPDESK_VIEW = "helpdesk:view",
  HELPDESK_MANAGE = "helpdesk:manage",
  WORKFLOW_VIEW = "workflow:view",
  WORKFLOW_MANAGE = "workflow:manage",
  KNOWLEDGE_VIEW = "knowledge:view",
  KNOWLEDGE_MANAGE = "knowledge:manage",
  ASSET_VIEW = "asset:view",
  ASSET_MANAGE = "asset:manage",
  ANALYTICS_VIEW = "analytics:view",
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
    Capability.PROJECT_VIEW,
    Capability.PROJECT_MANAGE,
    Capability.TASK_VIEW,
    Capability.TASK_MANAGE,
    Capability.WORKFORCE_VIEW,
    Capability.WORKFORCE_MANAGE,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.SERVICE_REQUEST_MANAGE,
    Capability.HELPDESK_VIEW,
    Capability.HELPDESK_MANAGE,
    Capability.WORKFLOW_VIEW,
    Capability.WORKFLOW_MANAGE,
    Capability.KNOWLEDGE_VIEW,
    Capability.KNOWLEDGE_MANAGE,
    Capability.ASSET_VIEW,
    Capability.ASSET_MANAGE,
    Capability.ANALYTICS_VIEW,
  ],
  OPERATIONS_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
    Capability.PROJECT_VIEW,
    Capability.PROJECT_MANAGE,
    Capability.TASK_VIEW,
    Capability.TASK_MANAGE,
    Capability.WORKFORCE_VIEW,
    Capability.WORKFORCE_MANAGE,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.SERVICE_REQUEST_MANAGE,
    Capability.HELPDESK_VIEW,
    Capability.HELPDESK_MANAGE,
    Capability.WORKFLOW_VIEW,
    Capability.WORKFLOW_MANAGE,
    Capability.KNOWLEDGE_VIEW,
    Capability.KNOWLEDGE_MANAGE,
    Capability.ASSET_VIEW,
    Capability.ASSET_MANAGE,
    Capability.ANALYTICS_VIEW,
  ],
  SALES_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.CRM_DELETE,
    Capability.PORTAL_VIEW,
    Capability.PROJECT_VIEW,
    Capability.TASK_VIEW,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.HELPDESK_VIEW,
    Capability.KNOWLEDGE_VIEW,
    Capability.ANALYTICS_VIEW,
  ],
  SALES_REPRESENTATIVE: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
    Capability.PROJECT_VIEW,
    Capability.TASK_VIEW,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.HELPDESK_VIEW,
    Capability.KNOWLEDGE_VIEW,
  ],
  ACCOUNT_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.CRM_MANAGE,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
    Capability.PROJECT_VIEW,
    Capability.PROJECT_MANAGE,
    Capability.TASK_VIEW,
    Capability.TASK_MANAGE,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.SERVICE_REQUEST_MANAGE,
    Capability.HELPDESK_VIEW,
    Capability.HELPDESK_MANAGE,
    Capability.KNOWLEDGE_VIEW,
    Capability.KNOWLEDGE_MANAGE,
    Capability.ANALYTICS_VIEW,
  ],
  FINANCE_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.PORTAL_VIEW,
    Capability.PROJECT_VIEW,
    Capability.TASK_VIEW,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.HELPDESK_VIEW,
    Capability.ASSET_VIEW,
    Capability.ANALYTICS_VIEW,
  ],
  PROJECT_MANAGER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.PORTAL_VIEW,
    Capability.PORTAL_MANAGE,
    Capability.PROJECT_VIEW,
    Capability.PROJECT_MANAGE,
    Capability.TASK_VIEW,
    Capability.TASK_MANAGE,
    Capability.WORKFORCE_VIEW,
    Capability.WORKFORCE_MANAGE,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.SERVICE_REQUEST_MANAGE,
    Capability.HELPDESK_VIEW,
    Capability.HELPDESK_MANAGE,
    Capability.WORKFLOW_VIEW,
    Capability.WORKFLOW_MANAGE,
    Capability.KNOWLEDGE_VIEW,
    Capability.KNOWLEDGE_MANAGE,
    Capability.ASSET_VIEW,
    Capability.ASSET_MANAGE,
    Capability.ANALYTICS_VIEW,
  ],
  TEAM_MEMBER: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.PORTAL_VIEW,
    Capability.PROJECT_VIEW,
    Capability.TASK_VIEW,
    Capability.TASK_MANAGE,
    Capability.WORKFORCE_VIEW,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.SERVICE_REQUEST_MANAGE,
    Capability.HELPDESK_VIEW,
    Capability.HELPDESK_MANAGE,
    Capability.KNOWLEDGE_VIEW,
    Capability.ASSET_VIEW,
  ],
  CONTRACTOR: [],
  CLIENT_ADMINISTRATOR: [],
  CLIENT_USER: [],
  READ_ONLY_AUDITOR: [
    Capability.ORG_VIEW_MEMBERS,
    Capability.CRM_VIEW,
    Capability.PORTAL_VIEW,
    Capability.PROJECT_VIEW,
    Capability.TASK_VIEW,
    Capability.WORKFORCE_VIEW,
    Capability.SERVICE_REQUEST_VIEW,
    Capability.HELPDESK_VIEW,
    Capability.WORKFLOW_VIEW,
    Capability.KNOWLEDGE_VIEW,
    Capability.ASSET_VIEW,
    Capability.ANALYTICS_VIEW,
  ],
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
