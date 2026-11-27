"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_GROUPS } from "./nav-config";

type Router = ReturnType<typeof useRouter>;

/** Built from NAV_GROUPS' real (href-having) items so the palette can
 * never drift out of sync with the sidebar/mobile nav — no separately
 * maintained destination list to go stale as modules ship. Deduped by
 * href since a few labels (e.g. "Pipeline"/"Opportunities") currently
 * point at the same page. */
const NAV_ACTIONS: { label: string; run: (router: Router) => void }[] = (() => {
  const seen = new Set<string>();
  const actions: { label: string; run: (router: Router) => void }[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.href || seen.has(item.href)) continue;
      seen.add(item.href);
      actions.push({ label: `Go to ${item.label}`, run: (router) => router.push(item.href!) });
    }
  }
  return actions;
})();

const ACCOUNT_ACTIONS: { label: string; run: (router: Router) => void }[] = [
  { label: "Sign out", run: () => signOut({ callbackUrl: "/" }) },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ACTIONS.map((action) => (
            <CommandItem
              key={action.label}
              onSelect={() => {
                setOpen(false);
                action.run(router);
              }}
            >
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Account">
          {ACCOUNT_ACTIONS.map((action) => (
            <CommandItem
              key={action.label}
              onSelect={() => {
                setOpen(false);
                action.run(router);
              }}
            >
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
