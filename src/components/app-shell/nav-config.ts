export interface NavItem {
  label: string;
  href?: string; // present only when the destination is actually implemented
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Mirrors the full sidebar information architecture from
 * docs/PRODUCT_REQUIREMENTS.md §6. Items without an `href` are genuinely not
 * built yet — they render as disabled rows, never as dead links or buttons
 * (see CLAUDE.md "no fake functionality"). As each module ships per
 * docs/MASTER_ROADMAP.md, give its item a real `href` here.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Home", href: "/dashboard" },
      { label: "My Work" },
      { label: "AI Command Centre" },
      { label: "Universal Inbox" },
      { label: "Calendar" },
    ],
  },
  {
    label: "Sales & Marketing",
    items: [
      { label: "Leads" },
      { label: "Contacts" },
      { label: "Companies" },
      { label: "Sales Pipeline" },
      { label: "Opportunities" },
      { label: "Campaigns" },
      { label: "Proposals" },
      { label: "Sales Intelligence" },
    ],
  },
  {
    label: "Client Management",
    items: [
      { label: "Clients" },
      { label: "Client 360" },
      { label: "Onboarding" },
      { label: "Client Portals" },
      { label: "Client Success" },
      { label: "Reviews" },
      { label: "Referrals" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Projects" },
      { label: "Tasks" },
      { label: "Service Requests" },
      { label: "Helpdesk" },
      { label: "Workflows" },
      { label: "Service Catalogue" },
      { label: "Knowledge Base" },
      { label: "Assets" },
      { label: "Team" },
      { label: "Resource Planning" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Estimates" },
      { label: "Invoices" },
      { label: "Payments" },
      { label: "Expenses" },
      { label: "Subscriptions" },
      { label: "Retainers" },
      { label: "Profitability" },
      { label: "Forecasting" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Agents" },
      { label: "Automations" },
      { label: "Reports" },
      { label: "Business Intelligence" },
      { label: "Business Health" },
      { label: "AI Audit Centre" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Integrations" },
      { label: "Templates" },
      { label: "Organisation Settings", href: "/members" },
      { label: "Branding" },
      { label: "Security" },
      { label: "Subscription and Billing" },
    ],
  },
];
