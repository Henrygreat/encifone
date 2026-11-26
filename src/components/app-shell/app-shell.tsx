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
    <div className="flex h-screen flex-col">
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
  );
}
