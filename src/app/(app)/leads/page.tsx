"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BentoEmptyState } from "@/components/bento/bento-grid";
import { formatEnumLabel } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { LEAD_STATUSES } from "@/modules/crm/constants";

interface MemberOption {
  id: string;
  user: { name: string | null; email: string };
}

interface LeadScoreFactor {
  label: string;
  points: number;
}

interface LeadRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  company: { id: string; name: string } | null;
  status: string;
  priority: string;
  score: number | null;
  source: string | null;
  owner: { user: { name: string | null; email: string } } | null;
}

interface LeadListResponse {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SavedViewFilters {
  search?: string;
  status?: string;
}

interface SavedView {
  id: string;
  name: string;
  ownerId: string | null;
  filters: SavedViewFilters;
}

const quickCreateSchema = z.object({
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  email: z.union([z.string().email("Enter a valid email address"), z.literal("")]).optional(),
  companyName: z.string().max(200).optional(),
  source: z.string().max(120).optional(),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  NEW: "default",
  CONTACTED: "secondary",
  QUALIFIED: "default",
  UNQUALIFIED: "outline",
  CONVERTED: "secondary",
  LOST: "destructive",
  ARCHIVED: "outline",
};

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoreLead, setScoreLead] = useState<LeadRow | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewShared, setSaveViewShared] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["leads", debouncedSearch, status, page],
    queryFn: async (): Promise<LeadListResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/v1/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load leads.");
      return res.json();
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members-options"],
    queryFn: async (): Promise<{ members: MemberOption[] }> => {
      const res = await fetch(`/api/v1/memberships`);
      if (!res.ok) throw new Error("Could not load organisation members.");
      return res.json();
    },
  });

  const { data: savedViews } = useQuery({
    queryKey: ["saved-views", "LEAD"],
    queryFn: async (): Promise<{ views: SavedView[] }> => {
      const res = await fetch(`/api/v1/saved-views?entityType=LEAD`);
      if (!res.ok) throw new Error("Could not load saved views.");
      return res.json();
    },
  });

  function applySavedView(view: SavedView) {
    setPage(1);
    setSearch(view.filters.search ?? "");
    setStatus(view.filters.status ?? "ALL");
    toast.success(`Applied "${view.name}".`);
  }

  async function onSaveView() {
    if (!saveViewName.trim()) return;
    const res = await fetch(`/api/v1/saved-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "LEAD",
        name: saveViewName.trim(),
        filters: { search: search || undefined, status: status === "ALL" ? undefined : status },
        shared: saveViewShared,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not save this view.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "LEAD"] });
    setSaveViewName("");
    setSaveViewShared(false);
    setSaveViewOpen(false);
    toast.success(`Saved "${result.name}".`);
  }

  async function onDeleteView(view: SavedView) {
    const res = await fetch(`/api/v1/saved-views/${view.id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      toast.error(result.error ?? "Could not delete this view.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "LEAD"] });
    toast.success(`Deleted "${view.name}".`);
  }

  const { data: qualification, isLoading: scoreLoading } = useQuery({
    enabled: Boolean(scoreLead),
    queryKey: ["lead-qualification", scoreLead?.id],
    queryFn: async (): Promise<{
      deterministic: { score: number; factors: LeadScoreFactor[] };
      ai: { narrative: string; provider: string; model: string } | null;
    }> => {
      const res = await fetch(`/api/v1/leads/${scoreLead?.id}/qualification`);
      if (!res.ok) throw new Error("Could not load the score breakdown.");
      return res.json();
    },
  });
  const scoreBreakdown = qualification?.deterministic;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({ resolver: zodResolver(quickCreateSchema) });

  async function onCreate(input: QuickCreateInput) {
    if (!input.firstName && !input.lastName && !input.companyName) {
      toast.error("Add at least a name or a company for this lead.");
      return;
    }
    const res = await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: input.firstName || undefined,
        lastName: input.lastName || undefined,
        email: input.email || undefined,
        companyName: input.companyName || undefined,
        source: input.source || undefined,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create lead.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["leads"] });
    reset();
    setDialogOpen(false);
    toast.success("Lead captured.");
  }

  async function onConvert(leadId: string) {
    setConvertingId(leadId);
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/convert`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not convert this lead.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Lead converted — a contact and/or company record was created or linked.");
    } finally {
      setConvertingId(null);
    }
  }

  function toggleAll(items: LeadRow[], checked: boolean) {
    setSelectedIds(checked ? new Set(items.map((l) => l.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function afterBulkAction(message: string) {
    await queryClient.invalidateQueries({ queryKey: ["leads"] });
    setSelectedIds(new Set());
    toast.success(message);
  }

  async function onBulkArchive() {
    const res = await fetch(`/api/v1/leads/bulk-archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not archive the selected leads.");
      return;
    }
    await afterBulkAction(`Archived ${result.affectedCount} lead${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async function onBulkReassign(ownerId: string | null) {
    const res = await fetch(`/api/v1/leads/bulk-reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), ownerId }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not reassign the selected leads.");
      return;
    }
    await afterBulkAction(`Reassigned ${result.affectedCount} lead${result.affectedCount === 1 ? "" : "s"}.`);
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((l) => selectedIds.has(l.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Pre-qualification records — convert into a contact and company once qualified.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Bookmark className="size-4" /> Views <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {savedViews?.views.length ? (
                savedViews.views.map((view) => (
                  // Two independent menu items, not a button nested inside
                  // one — a nested <button> isn't reachable by arrow-key
                  // navigation in a Radix dropdown (only the outer
                  // DropdownMenuItem is), so a keyboard-only user would have
                  // had no way to delete a view at all.
                  <div key={view.id} role="group" aria-label={view.name}>
                    <DropdownMenuItem onClick={() => applySavedView(view)}>
                      {view.name}
                      {view.ownerId === null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(shared)</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteView(view)}
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
              <DropdownMenuItem onClick={() => setSaveViewOpen(true)}>Save current view…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-crm)", color: "var(--module-on-accent)" }}>New lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Capture a lead</DialogTitle>
              <DialogDescription>
                Everything here is free-text until converted — a real Contact/Company record is
                created (or linked) at that point.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" {...register("firstName")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" {...register("lastName")} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email (optional)</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyName">Company name (optional)</Label>
                <Input id="companyName" {...register("companyName")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="source">Source (optional)</Label>
                <Input id="source" placeholder="e.g. Website form, Referral" {...register("source")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Capturing…" : "Capture lead"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search leads…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {formatEnumLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5">
            <span className="text-sm text-foreground">{selectedIds.size} selected</span>
            <Button variant="outline" size="sm" onClick={onBulkArchive}>
              Archive
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Reassign owner <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onBulkReassign(null)}>Unassigned</DropdownMenuItem>
                {members?.members.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => onBulkReassign(m.id)}>
                    {m.user.name ?? m.user.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <BentoEmptyState
            title="No leads yet"
            description="Capture your first lead from an enquiry, referral, or import — qualify and convert it into a contact and company when it's ready."
            action={<Button onClick={() => setDialogOpen(true)}>New lead</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => toggleAll(items, Boolean(v))}
                      aria-label="Select all leads on this page"
                    />
                  </TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((lead) => {
                  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || "Unnamed lead";
                  const canConvert = !["CONVERTED", "ARCHIVED", "LOST"].includes(lead.status);
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={(v) => toggleOne(lead.id, Boolean(v))}
                          aria-label={`Select ${name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{name}</span>
                          {lead.email && <span className="text-xs text-muted-foreground">{lead.email}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.company?.name ?? lead.companyName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lead.source ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{formatEnumLabel(lead.priority)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {/* Deterministic, explainable score — see
                            src/modules/intelligence/lead-scoring.ts. Clicking
                            it shows the real factor breakdown, never just a
                            bare number with no explanation. */}
                        {lead.score === null ? (
                          "—"
                        ) : (
                          <button
                            type="button"
                            className="underline-offset-2 hover:underline"
                            onClick={() => setScoreLead(lead)}
                          >
                            {lead.score}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.owner?.user.name ?? lead.owner?.user.email ?? "Unassigned"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANT[lead.status] ?? "outline"}>
                          {formatEnumLabel(lead.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canConvert && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={convertingId === lead.id}
                            onClick={() => onConvert(lead.id)}
                          >
                            {convertingId === lead.id ? "Converting…" : "Convert"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {data.page} of {data.totalPages} — {data.total} lead{data.total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(scoreLead)} onOpenChange={(open) => !open && setScoreLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Score breakdown
              {scoreLead ? ` — ${[scoreLead.firstName, scoreLead.lastName].filter(Boolean).join(" ") || scoreLead.email}` : ""}
            </DialogTitle>
            <DialogDescription>
              The score itself is always deterministic and explainable — a transparent, rule-based
              calculation, not a prediction. The qualification note below is AI-generated only when your
              organisation has AI configured.
            </DialogDescription>
          </DialogHeader>
          {scoreLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !scoreBreakdown || scoreBreakdown.factors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scoring factors apply yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {scoreBreakdown.factors.map((factor, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{factor.label}</span>
                    <span className="text-muted-foreground">+{factor.points}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-medium">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{scoreBreakdown.score}</span>
                </li>
              </ul>
              {qualification?.ai ? (
                <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    AI qualification note ({qualification.ai.model})
                  </p>
                  <p className="text-sm text-foreground">{qualification.ai.narrative}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No AI qualification note — AI isn&apos;t configured for this organisation (Organisation
                  Settings).
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Saves the current search and status filter — not the selected rows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="viewName">View name</Label>
              <Input id="viewName" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="viewShared" className="flex flex-col gap-0.5">
                <span>Share with the team</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Off = visible only to you
                </span>
              </Label>
              <Switch id="viewShared" checked={saveViewShared} onCheckedChange={setSaveViewShared} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={!saveViewName.trim()} onClick={onSaveView}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
