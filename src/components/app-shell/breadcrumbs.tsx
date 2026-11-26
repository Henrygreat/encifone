"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_GROUPS } from "./nav-config";
import { formatEnumLabel } from "@/lib/utils";

/** Matches the current path against nav-config.ts for a real label where
 * one exists, falling back to a humanised version of the path segment
 * otherwise — never a raw slug. */
function labelForPath(path: string): string {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.href === path);
    if (item) return item.label;
  }
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  return formatEnumLabel(segment.replace(/-/g, "_"));
}

export function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/dashboard" || pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((_, i) => "/" + segments.slice(0, i + 1).join("/"));

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-border px-6 py-2.5 text-sm text-muted-foreground"
    >
      <Link href="/dashboard" className="hover:text-foreground">
        Home
      </Link>
      {crumbs.map((path, i) => (
        <span key={path} className="flex items-center gap-1">
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-foreground" aria-current="page">
              {labelForPath(path)}
            </span>
          ) : (
            <Link href={path} className="hover:text-foreground">
              {labelForPath(path)}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
