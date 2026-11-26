"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { branding } from "@/config/branding";
import { SidebarNav } from "./sidebar-nav";

/** Collapsed state is a compact icon-only rail (w-16), not a vanished
 * sidebar — a "compact collapsible sidebar" per the brief, not a hidden
 * one. Desktop only (md:); mobile uses the Sheet-based drawer in
 * mobile-nav.tsx instead. */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center" : "px-4")}>
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-sidebar-foreground">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--module-sales), var(--module-intelligence))" }}
          >
            {branding.productName[0]}
          </span>
          {!collapsed && branding.productName}
        </Link>
      </div>
      <SidebarNav iconOnly={collapsed} />
    </aside>
  );
}
