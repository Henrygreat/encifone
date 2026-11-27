"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { branding } from "@/config/branding";
import { SidebarNav } from "./sidebar-nav";

/** Mobile-only nav drawer — the sidebar is `hidden md:block`, so below
 * that breakpoint there was previously no way to navigate at all. Shares
 * SidebarNav with the desktop sidebar so the two can't drift apart. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground sm:w-72">
        <SheetHeader className="h-14 flex-row items-center border-b border-sidebar-border px-4">
          <SheetTitle asChild>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 text-sm font-semibold">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--module-sales), var(--module-intelligence))" }}
              >
                {branding.productName[0]}
              </span>
              {branding.productName}
            </Link>
          </SheetTitle>
        </SheetHeader>
        <div onClick={() => setOpen(false)}>
          <SidebarNav />
        </div>
      </SheetContent>
    </Sheet>
  );
}
