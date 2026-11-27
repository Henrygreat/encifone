import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  CalendarDays,
  Sparkles,
  Users,
  Building2,
  Target,
  KanbanSquare,
  Megaphone,
  FileText,
  TrendingUp,
  FolderKanban,
  CheckSquare,
  LifeBuoy,
  Workflow,
  Package,
  BookOpen,
  Boxes,
  UsersRound,
  CalendarRange,
  BarChart3,
  Bot,
  ShieldCheck,
  Plug,
  LayoutTemplate,
  Settings,
  Palette,
  Lock,
  CreditCard,
} from "lucide-react";

export type ModuleKey = "overview" | "crm" | "sales" | "work" | "intelligence" | "admin";

export interface NavItem {
  label: string;
  href?: string; // present only when the destination is actually implemented
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  module: ModuleKey;
  items: NavItem[];
}

/**
 * Regroups the full planned IA from docs/PRODUCT_REQUIREMENTS.md §6 (the
 * original 7-group sidebar: Workspace / Sales & Marketing / Client
 * Management / Operations / Finance / Intelligence / Administration) into
 * the 6 top-level groups requested for Phase 2A's navigation redesign (see
 * docs/DECISION_LOG.md). Every item from the original list is preserved —
 * none dropped — remapped as follows: "Client Management" folds into CRM
 * (client relationship is a CRM extension); "Finance" folds into Work
 * management (operational/billing); "Workspace" becomes Overview;
 * "Sales & Marketing" splits into CRM (contact/lead capture) and Sales
 * (pipeline/proposals). Each group carries a `module` key resolving to a
 * CSS accent token (`--color-module-<key>`, docs/DESIGN_SYSTEM.md §3) for
 * icon tint and active-state highlighting. Items without an `href` are
 * genuinely not built yet — they render as disabled rows, never as dead
 * links or buttons (see CLAUDE.md "no fake functionality"). As each module
 * ships per docs/MASTER_ROADMAP.md, give its item a real `href` here.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    module: "overview",
    items: [
      { label: "Home", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Work", icon: CheckSquare },
      { label: "AI Command Centre", icon: Sparkles },
      { label: "Universal Inbox", icon: Inbox },
      { label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "CRM",
    module: "crm",
    items: [
      { label: "Leads", href: "/leads", icon: Target },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Companies", href: "/companies", icon: Building2 },
      { label: "Campaigns", icon: Megaphone },
      { label: "Clients", href: "/clients", icon: UsersRound },
      { label: "Onboarding", icon: CheckSquare },
      { label: "Client Portals", icon: LayoutTemplate },
      { label: "Client Success", icon: ShieldCheck },
      { label: "Reviews", icon: FileText },
      { label: "Referrals", icon: Megaphone },
    ],
  },
  {
    label: "Sales",
    module: "sales",
    items: [
      { label: "Pipeline", href: "/deals", icon: KanbanSquare },
      { label: "Opportunities", href: "/deals", icon: TrendingUp },
      { label: "Proposals", icon: FileText },
      { label: "Sales Intelligence", icon: TrendingUp },
    ],
  },
  {
    label: "Work management",
    module: "work",
    items: [
      { label: "Projects", icon: FolderKanban },
      { label: "Tasks", icon: CheckSquare },
      { label: "Service Requests", icon: LifeBuoy },
      { label: "Helpdesk", icon: LifeBuoy },
      { label: "Workflows", icon: Workflow },
      { label: "Service Catalogue", icon: Package },
      { label: "Knowledge Base", icon: BookOpen },
      { label: "Assets", icon: Boxes },
      { label: "Team", icon: UsersRound },
      { label: "Resource Planning", icon: CalendarRange },
      { label: "Estimates", icon: FileText },
      { label: "Invoices", icon: FileText },
      { label: "Payments", icon: CreditCard },
      { label: "Expenses", icon: CreditCard },
      { label: "Subscriptions", icon: CreditCard },
      { label: "Retainers", icon: CreditCard },
      { label: "Profitability", icon: BarChart3 },
      { label: "Forecasting", icon: BarChart3 },
    ],
  },
  {
    label: "Intelligence",
    module: "intelligence",
    items: [
      { label: "AI Agents", icon: Bot },
      { label: "Automations", icon: Workflow },
      { label: "Reports", icon: BarChart3 },
      { label: "Business Intelligence", icon: BarChart3 },
      { label: "Business Health", icon: ShieldCheck },
      { label: "AI Audit Centre", icon: ShieldCheck },
    ],
  },
  {
    label: "Administration",
    module: "admin",
    items: [
      { label: "Integrations", icon: Plug },
      { label: "Templates", icon: LayoutTemplate },
      { label: "Organisation Settings", href: "/members", icon: Settings },
      { label: "Branding", icon: Palette },
      { label: "Security", icon: Lock },
      { label: "Subscription and Billing", icon: CreditCard },
    ],
  },
];
