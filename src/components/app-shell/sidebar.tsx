"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { branding } from "@/config/branding";
import { NAV_GROUPS } from "./nav-config";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block",
        collapsed ? "w-0 border-r-0" : "w-64"
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "hidden")}>
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          {branding.productName}
        </Link>
      </div>
      <nav className={cn("flex flex-col gap-6 px-3 py-4", collapsed && "hidden")}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
              {group.label}
            </h3>
            {group.items.map((item) => {
              const isActive = item.href && pathname === item.href;
              if (!item.href) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/40"
                    title="Not available yet — see docs/ROADMAP.md"
                  >
                    <span>{item.label}</span>
                    <span className="rounded-full border border-sidebar-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/40">
                      Planned
                    </span>
                  </div>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
