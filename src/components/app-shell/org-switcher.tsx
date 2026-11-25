"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

interface OrgSummary {
  organisationId: string;
  name: string;
  role: string;
  isDefault: boolean;
}

export function OrgSwitcher({ activeOrganisationId }: { activeOrganisationId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["organisations", "me"],
    queryFn: async (): Promise<{ organisations: OrgSummary[] }> => {
      const res = await fetch("/api/v1/organisations/me");
      if (!res.ok) throw new Error("Could not load organisations.");
      return res.json();
    },
  });

  const organisations = data?.organisations ?? [];
  const active = organisations.find((o) => o.organisationId === activeOrganisationId);

  async function switchTo(organisationId: string) {
    if (organisationId === activeOrganisationId) return;
    const res = await fetch("/api/v1/org-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisationId }),
    });
    if (!res.ok) {
      toast.error("Could not switch organisation.");
      return;
    }
    router.refresh();
  }

  async function createOrganisation() {
    if (!newOrgName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const created = await res.json();
      if (!res.ok) {
        toast.error(created.error ?? "Could not create organisation.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["organisations", "me"] });
      setDialogOpen(false);
      setNewOrgName("");
      await switchTo(created.organisationId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="justify-between gap-2">
            <span className="truncate">{active?.name ?? "Select organisation"}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your organisations</DropdownMenuLabel>
          {organisations.map((org) => (
            <DropdownMenuItem key={org.organisationId} onSelect={() => switchTo(org.organisationId)}>
              <span className="truncate">{org.name}</span>
              {org.organisationId === activeOrganisationId && (
                <span className="ml-auto text-xs text-muted-foreground">Active</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            New organisation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new organisation</DialogTitle>
            <DialogDescription>
              You&apos;ll be the owner of this organisation. You can switch between it and your
              other organisations at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-org-name">Organisation name</Label>
            <Input
              id="new-org-name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Acme Consulting"
            />
          </div>
          <DialogFooter>
            <Button onClick={createOrganisation} disabled={submitting || !newOrgName.trim()}>
              {submitting ? "Creating…" : "Create organisation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
