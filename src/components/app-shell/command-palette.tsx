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

/** Only real, implemented destinations — see nav-config.ts for why. */
const ACTIONS = [
  { label: "Go to Home", run: (router: ReturnType<typeof useRouter>) => router.push("/dashboard") },
  {
    label: "Go to Organisation Settings",
    run: (router: ReturnType<typeof useRouter>) => router.push("/members"),
  },
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
        <CommandGroup heading="Actions">
          {ACTIONS.map((action) => (
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
