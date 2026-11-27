"use client";

import { Bookmark, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SavedView } from "@/lib/use-saved-views";

/** The "Views" dropdown shared by Contacts/Companies/Leads — apply, delete,
 * or start saving a new view. Pairs with the useSavedViews() hook. */
export function SavedViewSelector<F>({
  views,
  onApply,
  onDelete,
  onSaveNew,
}: {
  views: SavedView<F>[];
  onApply: (view: SavedView<F>) => void;
  onDelete: (view: SavedView<F>) => void;
  onSaveNew: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Bookmark className="size-4" /> Views <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {views.length ? (
          views.map((view) => (
            // Two independent menu items, not a button nested inside one —
            // a nested <button> isn't reachable by arrow-key navigation in
            // a Radix dropdown (only the outer DropdownMenuItem is), so a
            // keyboard-only user would have had no way to delete a view.
            <div key={view.id} role="group" aria-label={view.name}>
              <DropdownMenuItem onClick={() => onApply(view)}>
                {view.name}
                {view.ownerId === null && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(shared)</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(view)}
                className="pl-6 text-xs text-muted-foreground focus:text-destructive"
              >
                Delete &ldquo;{view.name}&rdquo;
              </DropdownMenuItem>
            </div>
          ))
        ) : (
          <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSaveNew}>Save current view…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The "Save current view" dialog shared by Contacts/Companies/Leads.
 * `description` lets each page name exactly which filters get saved. */
export function SaveViewDialog({
  open,
  onOpenChange,
  description,
  name,
  onNameChange,
  shared,
  onSharedChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  name: string;
  onNameChange: (name: string) => void;
  shared: boolean;
  onSharedChange: (shared: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="viewName">View name</Label>
            <Input id="viewName" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="viewShared" className="flex flex-col gap-0.5">
              <span>Share with the team</span>
              <span className="text-xs font-normal text-muted-foreground">Off = visible only to you</span>
            </Label>
            <Switch id="viewShared" checked={shared} onCheckedChange={onSharedChange} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={!name.trim()} onClick={onSave}>
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
