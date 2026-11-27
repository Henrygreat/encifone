"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CommandPalette } from "./command-palette";
import { Breadcrumbs } from "./breadcrumbs";

export function AppShell({
  activeOrganisationId,
  user,
  children,
}: {
  activeOrganisationId: string;
  user: { name?: string | null; email?: string | null; image?: string | null };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex h-screen flex-col">
      {/* Aurora theme's ambient glow — renders nothing in Professional
          Dark/Light (see .aurora-atmosphere in globals.css). Mounted once
          here, never per-page or per-card. */}
      <div className="aurora-atmosphere" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col">
        <TopBar
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          activeOrganisationId={activeOrganisationId}
          user={user}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={collapsed} />
          <main className="flex flex-1 flex-col overflow-y-auto bg-background">
            <Breadcrumbs />
            <div className="flex-1">{children}</div>
          </main>
        </div>
        <CommandPalette />
      </div>
    </div>
  );
}
