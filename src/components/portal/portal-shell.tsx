"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileCheck2, FolderOpen, FolderKanban, LifeBuoy, BookOpen, Boxes, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { resolvePortalBranding } from "@/config/branding";

const NAV = [
  { href: "/portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/projects", label: "Projects", icon: FolderKanban },
  { href: "/portal/onboarding", label: "Onboarding", icon: FileCheck2 },
  { href: "/portal/service-requests", label: "Requests", icon: LifeBuoy },
  { href: "/portal/helpdesk", label: "Support", icon: LifeBuoy },
  { href: "/portal/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/portal/assets", label: "Assets", icon: Boxes },
  { href: "/portal/documents", label: "Documents", icon: FolderOpen },
];

/**
 * The portal's own shell — intentionally plain compared to the internal
 * app's sidebar/command-palette/3D-orb command centre: a top bar with a
 * few top-level links, no collapsible rail, no AI visuals. Per the
 * portal design brief, this surface should read as "clean and
 * professional," not as a smaller copy of the internal tool.
 */
export function PortalShell({
  identity,
  clientName,
  children,
}: {
  identity: ReturnType<typeof resolvePortalBranding>;
  clientName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.push("/portal/login");
  }

  return (
    <div className="theme-client-portal flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6" style={{ borderBottomColor: identity.accentColor }}>
        <div className="flex items-center gap-6">
          <div className="flex min-w-0 items-center gap-2">
            {identity.logoUrl && (
              // Tenant-hosted assets load directly from the browser without proxying.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.logoUrl} alt="" referrerPolicy="no-referrer" className="size-7 shrink-0 object-contain" />
            )}
            <div>
              <p className="text-sm font-semibold">{identity.name}</p>
              <p className="text-xs text-muted-foreground">{clientName}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground"
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {identity.attribution && <p className="hidden text-xs text-muted-foreground sm:block">{identity.attribution}</p>}
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b border-border px-4 py-2 sm:hidden">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs text-muted-foreground",
                active && "bg-muted text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">{children}</div>
      </main>
      {identity.contactEmail && <footer className="px-4 pb-4 text-center text-xs">
        <a className="underline" href={`mailto:${identity.contactEmail}`}>Contact {identity.name}</a>
      </footer>}
    </div>
  );
}
