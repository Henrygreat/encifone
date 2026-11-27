"use client";

import { PanelLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { ThemeSwitcher } from "./theme-switcher";
import { MobileNav } from "./mobile-nav";
import { NotificationCentre } from "./notification-centre";

export function TopBar({
  collapsed,
  onToggleSidebar,
  activeOrganisationId,
  user,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  activeOrganisationId: string;
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <MobileNav />
      <Button
        variant="ghost"
        size="icon"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggleSidebar}
        className="hidden md:inline-flex"
      >
        <PanelLeft className="size-4" />
      </Button>

      <OrgSwitcher activeOrganisationId={activeOrganisationId} />

      <Button
        variant="outline"
        className="ml-2 hidden flex-1 max-w-sm items-center justify-between text-muted-foreground sm:flex"
        onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
      >
        <span className="flex items-center gap-2">
          <Search className="size-4" />
          Search…
        </span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <NotificationCentre />
        <ThemeSwitcher />
        <UserMenu name={user.name} email={user.email} image={user.image} />
      </div>
    </header>
  );
}
