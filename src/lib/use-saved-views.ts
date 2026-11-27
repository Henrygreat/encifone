"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SavedView<F> {
  id: string;
  name: string;
  ownerId: string | null;
  filters: F;
}

/**
 * Saved-view CRUD shared by Contacts/Companies/Leads — identical API
 * shape (src/app/api/v1/saved-views) across all three, differing only
 * by entityType and each page's own filter shape F. Applying a view
 * stays page-local (each page knows how to map its own filters back
 * onto its own state setters).
 */
export function useSavedViews<F extends object>(entityType: string) {
  const queryClient = useQueryClient();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const { data } = useQuery({
    queryKey: ["saved-views", entityType],
    queryFn: async (): Promise<{ views: SavedView<F>[] }> => {
      const res = await fetch(`/api/v1/saved-views?entityType=${entityType}`);
      if (!res.ok) throw new Error("Could not load saved views.");
      return res.json();
    },
  });

  async function save(filters: F) {
    if (!name.trim()) return;
    const res = await fetch(`/api/v1/saved-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, name: name.trim(), filters, shared }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not save this view.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["saved-views", entityType] });
    setName("");
    setShared(false);
    setSaveDialogOpen(false);
    toast.success(`Saved "${result.name}".`);
  }

  async function remove(view: SavedView<F>) {
    const res = await fetch(`/api/v1/saved-views/${view.id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      toast.error(result.error ?? "Could not delete this view.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["saved-views", entityType] });
    toast.success(`Deleted "${view.name}".`);
  }

  return {
    views: data?.views ?? [],
    saveDialogOpen,
    setSaveDialogOpen,
    name,
    setName,
    shared,
    setShared,
    save,
    remove,
  };
}
