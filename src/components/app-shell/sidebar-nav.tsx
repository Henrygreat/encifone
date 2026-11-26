"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, type ModuleKey } from "./nav-config";

export const MODULE_VAR: Record<ModuleKey, string> = {
  overview: "var(--module-overview)",
  crm: "var(--module-crm)",
  sales: "var(--module-sales)",
  work: "var(--module-work)",
  intelligence: "var(--module-intelligence)",
  admin: "var(--module-admin)",
};

/** How many not-yet-built ("Planned") items a group shows before
 * collapsing the rest behind a "+N more" toggle — the "less intrusive
 * presentation of planned modules" requirement. Real (href-having) items
 * are never hidden; only the placeholder rows collapse. */
const VISIBLE_PLANNED_PER_GROUP = 2;

function NavGroupSection({ group, iconOnly }: { group: (typeof NAV_GROUPS)[number]; iconOnly: boolean }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const accent = MODULE_VAR[group.module];

  const realItems = group.items.filter((item) => item.href);
  const plannedItems = group.items.filter((item) => !item.href);
  const visiblePlanned = expanded ? plannedItems : plannedItems.slice(0, VISIBLE_PLANNED_PER_GROUP);
  const hiddenCount = plannedItems.length - visiblePlanned.length;

  return (
    <div className="flex flex-col gap-0.5">
      {!iconOnly && (
        <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {group.label}
        </h3>
      )}
      {realItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href!}
            title={iconOnly ? item.label : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              iconOnly && "justify-center px-0",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" style={{ color: isActive ? accent : undefined }} />
            {!iconOnly && item.label}
          </Link>
        );
      })}
      {!iconOnly &&
        visiblePlanned.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs text-sidebar-foreground/35"
              title="Not available yet — see docs/MASTER_ROADMAP.md"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </span>
            </div>
          );
        })}
      {!iconOnly && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 px-2 py-1 text-left text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
        >
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          {expanded ? "Show less" : `+${hiddenCount} more (planned)`}
        </button>
      )}
    </div>
  );
}

/** Shared nav content — rendered by both the desktop sidebar (full or
 * icon-only rail) and the mobile drawer (src/components/app-shell/mobile-nav.tsx),
 * so the two never drift out of sync with nav-config.ts. */
export function SidebarNav({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <NavGroupSection key={group.label} group={group} iconOnly={iconOnly} />
      ))}
    </nav>
  );
}
