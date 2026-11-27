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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { COMPANY_STATUSES } from "@/modules/crm/constants";

interface MemberOption {
  id: string;
  user: { name: string | null; email: string };
}

interface CompanyRow {
  id: string;
  name: string;
  industry: string | null;
  companySize: string | null;
  status: string;
  owner: { user: { name: string | null; email: string } } | null;
  _count: { contacts: number; opportunities: number };
}

interface CompanyListResponse {
  items: CompanyRow[];
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
  name: z.string().min(1, "Company name is required").max(200),
  industry: z.string().max(120).optional(),
  website: z.union([z.string().url("Enter a valid URL, e.g. https://example.com"), z.literal("")]).optional(),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "outline",
};

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewShared, setSaveViewShared] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["companies", debouncedSearch, status, page],
    queryFn: async (): Promise<CompanyListResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/v1/companies?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load companies.");
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
    queryKey: ["saved-views", "COMPANY"],
    queryFn: async (): Promise<{ views: SavedView[] }> => {
      const res = await fetch(`/api/v1/saved-views?entityType=COMPANY`);
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
        entityType: "COMPANY",
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
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "COMPANY"] });
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
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "COMPANY"] });
    toast.success(`Deleted "${view.name}".`);
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({ resolver: zodResolver(quickCreateSchema) });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        industry: input.industry || undefined,
        website: input.website || undefined,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create company.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    await queryClient.invalidateQueries({ queryKey: ["companies-options"] });
    reset();
    setDialogOpen(false);
    toast.success(`${input.name} was added to your companies.`);
  }

  function toggleAll(items: CompanyRow[], checked: boolean) {
    setSelectedIds(checked ? new Set(items.map((c) => c.id)) : new Set());
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
    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    setSelectedIds(new Set());
    toast.success(message);
  }

  async function onBulkArchive() {
    const res = await fetch(`/api/v1/companies/bulk-archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not archive the selected companies.");
      return;
    }
    await afterBulkAction(`Archived ${result.affectedCount} compan${result.affectedCount === 1 ? "y" : "ies"}.`);
  }

  async function onBulkReassign(ownerId: string | null) {
    const res = await fetch(`/api/v1/companies/bulk-reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), ownerId }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not reassign the selected companies.");
      return;
    }
    await afterBulkAction(`Reassigned ${result.affectedCount} compan${result.affectedCount === 1 ? "y" : "ies"}.`);
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((c) => selectedIds.has(c.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Organisations you do business with, and the contacts and deals tied to them.
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
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => applySavedView(view)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {view.name}
                      {view.ownerId === null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(shared)</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteView(view);
                      }}
                    >
                      Delete
                    </button>
                  </DropdownMenuItem>
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
            <Button style={{ background: "var(--module-crm)" }}>New company</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a company</DialogTitle>
              <DialogDescription>
                You can add more detail (address, parent company, notes) once it&apos;s created.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Company name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="industry">Industry (optional)</Label>
                <Input id="industry" {...register("industry")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="website">Website (optional)</Label>
                <Input id="website" placeholder="https://" {...register("website")} />
                {errors.website && <p className="text-xs text-destructive">{errors.website.message}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding…" : "Add company"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search companies…"
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
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {COMPANY_STATUSES.map((s) => (
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
            title="No companies yet"
            description="Add the organisations you work with to group contacts and deals under them."
            action={<Button onClick={() => setDialogOpen(true)}>New company</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(items, Boolean(v))} />
                  </TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Opportunities</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(company.id)}
                        onCheckedChange={(v) => toggleOne(company.id, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback>{company.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{company.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{company.industry ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{company._count.contacts}</TableCell>
                    <TableCell className="text-muted-foreground">{company._count.opportunities}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.owner?.user.name ?? company.owner?.user.email ?? "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[company.status] ?? "outline"}>
                        {formatEnumLabel(company.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {data.page} of {data.totalPages} — {data.total} compan{data.total === 1 ? "y" : "ies"}
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
