"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * No notification backend exists yet — this is deliberately an honest
 * empty shell, not a stub populated with invented activity (CLAUDE.md
 * rule 6 / rule 4). Once a real notification system is built (delivery,
 * read-state, etc.), this component's body is the only thing that needs
 * to change — the trigger/UI chrome is already in place.
 */
export function NotificationCentre() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Notifications</p>
          <p className="text-sm text-muted-foreground">
            Nothing yet — notifications aren&apos;t wired up to anything in this build.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
