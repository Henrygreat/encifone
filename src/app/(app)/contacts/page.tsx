"use client";

import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, ChevronDown, Download, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { CONTACT_STATUSES } from "@/modules/crm/constants";

interface CompanyOption {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  user: { name: string | null; email: string };
}

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: string;
  tags: string[];
  company: { id: string; name: string } | null;
  owner: { user: { name: string | null; email: string } } | null;
}

interface ContactListResponse {
  items: ContactRow[];
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

interface DuplicateGroup {
  matchedOn: "email";
  value: string;
  contacts: { id: string; firstName: string; lastName: string; companyName: string | null }[];
}

interface ImportResult {
  createdCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

const quickCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(120),
  lastName: z.string().min(1, "Last name is required").max(120),
  email: z.union([z.string().email("Enter a valid email address"), z.literal("")]).optional(),
  phone: z.string().max(40).optional(),
  jobTitle: z.string().max(160).optional(),
  companyId: z.string().optional(),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "outline",
};

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [mergingGroupValue, setMergingGroupValue] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewShared, setSaveViewShared] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", debouncedSearch, status, page],
    queryFn: async (): Promise<ContactListResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/v1/contacts?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load contacts.");
      return res.json();
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies-options"],
    queryFn: async (): Promise<{ items: CompanyOption[] }> => {
      const res = await fetch(`/api/v1/companies?pageSize=100`);
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

  const { data: duplicateGroups, isLoading: duplicatesLoading } = useQuery({
    enabled: duplicatesOpen,
    queryKey: ["contact-duplicates"],
    queryFn: async (): Promise<{ groups: DuplicateGroup[] }> => {
      const res = await fetch(`/api/v1/contacts/duplicates`);
      if (!res.ok) throw new Error("Could not check for duplicates.");
      return res.json();
    },
  });

  const { data: savedViews } = useQuery({
    queryKey: ["saved-views", "CONTACT"],
    queryFn: async (): Promise<{ views: SavedView[] }> => {
      const res = await fetch(`/api/v1/saved-views?entityType=CONTACT`);
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
        entityType: "CONTACT",
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
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "CONTACT"] });
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
    await queryClient.invalidateQueries({ queryKey: ["saved-views", "CONTACT"] });
    toast.success(`Deleted "${view.name}".`);
  }

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({ resolver: zodResolver(quickCreateSchema) });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle || undefined,
        companyId: input.companyId || undefined,
        emails: input.email ? [{ address: input.email, isPrimary: true }] : [],
        phones: input.phone ? [{ number: input.phone, isPrimary: true }] : [],
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create contact.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    reset();
    setDialogOpen(false);
    toast.success(`${input.firstName} ${input.lastName} was added to your contacts.`);
  }

  function toggleAll(items: ContactRow[], checked: boolean) {
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
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    setSelectedIds(new Set());
    toast.success(message);
  }

  async function onBulkArchive() {
    const res = await fetch(`/api/v1/contacts/bulk-archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not archive the selected contacts.");
      return;
    }
    await afterBulkAction(`Archived ${result.affectedCount} contact${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async function onBulkReassign(ownerId: string | null) {
    const res = await fetch(`/api/v1/contacts/bulk-reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), ownerId }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not reassign the selected contacts.");
      return;
    }
    await afterBulkAction(`Reassigned ${result.affectedCount} contact${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async function onBulkTag() {
    if (!bulkTag.trim()) return;
    const res = await fetch(`/api/v1/contacts/bulk-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), tag: bulkTag.trim() }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not tag the selected contacts.");
      return;
    }
    setBulkTag("");
    setTagDialogOpen(false);
    await afterBulkAction(`Tagged ${result.affectedCount} contact${result.affectedCount === 1 ? "" : "s"}.`);
  }

  async function onImportSubmit() {
    if (!importCsv.trim()) return;
    setImportSubmitting(true);
    try {
      const res = await fetch(`/api/v1/contacts/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: importCsv }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not import this file.");
        return;
      }
      setImportResult(result);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (result.createdCount > 0) {
        toast.success(`Imported ${result.createdCount} contact${result.createdCount === 1 ? "" : "s"}.`);
      }
    } finally {
      setImportSubmitting(false);
    }
  }

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function onMergeGroup(group: DuplicateGroup) {
    const [keep, ...rest] = group.contacts;
    setMergingGroupValue(group.value);
    try {
      for (const loser of rest) {
        const res = await fetch(`/api/v1/contacts/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keepId: keep.id, mergeId: loser.id }),
        });
        if (!res.ok) {
          const result = await res.json();
          toast.error(result.error ?? "Could not merge these contacts.");
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["contact-duplicates"] });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`Merged into ${keep.firstName} ${keep.lastName}.`);
    } finally {
      setMergingGroupValue(null);
    }
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((c) => selectedIds.has(c.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            People you do business with across your organisation.
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
          <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
            <Users className="size-4" /> Find duplicates
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import CSV
          </Button>
          <Button variant="outline" asChild>
            {/* API download endpoint, not an app page — a plain anchor
                triggers the browser's native download via Content-
                Disposition; next/link's client-side routing doesn't apply. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/v1/contacts/export">
              <Download className="size-4" /> Export CSV
            </a>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button style={{ background: "var(--module-crm)", color: "var(--module-on-accent)" }}>New contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a contact</DialogTitle>
                <DialogDescription>
                  You can add more detail (notes, tags, additional emails) once they&apos;re created.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" {...register("firstName")} />
                    {errors.firstName && (
                      <p className="text-xs text-destructive">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" {...register("lastName")} />
                    {errors.lastName && (
                      <p className="text-xs text-destructive">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input id="email" type="email" {...register("email")} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input id="phone" {...register("phone")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jobTitle">Job title (optional)</Label>
                    <Input id="jobTitle" {...register("jobTitle")} />
                  </div>
                </div>
                {companies?.items?.length ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>Company (optional)</Label>
                    <Controller
                      control={control}
                      name="companyId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="No company" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.items.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Adding…" : "Add contact"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search contacts…"
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
            {CONTACT_STATUSES.map((s) => (
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
            <Button variant="outline" size="sm" onClick={() => setTagDialogOpen(true)}>
              Add tag
            </Button>
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
            title="No contacts yet"
            description="Add your first contact to start tracking relationships, companies, and deals."
            action={<Button onClick={() => setDialogOpen(true)}>New contact</Button>}
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
                      aria-label="Select all contacts on this page"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={(v) => toggleOne(contact.id, Boolean(v))}
                        aria-label={`Select ${contact.firstName} ${contact.lastName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {initials(contact.firstName, contact.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">
                          {contact.firstName} {contact.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.company?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{contact.jobTitle ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.owner?.user.name ?? contact.owner?.user.email ?? "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[contact.status] ?? "outline"}>
                        {formatEnumLabel(contact.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {data.page} of {data.totalPages} — {data.total} contact{data.total === 1 ? "" : "s"}
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

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setImportCsv("");
            setImportResult(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import contacts from CSV</DialogTitle>
            <DialogDescription>
              Columns: firstName, lastName, email, phone, jobTitle, companyName. Bad rows are skipped and
              reported — nothing is guessed on your behalf.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFileSelected(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            Choose a CSV file…
          </Button>
          <Textarea
            placeholder="Or paste CSV content here…"
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
            rows={8}
          />
          {importResult && (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="text-foreground">
                {importResult.createdCount} created, {importResult.errorCount} skipped.
              </p>
              {importResult.errors.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" disabled={importSubmitting || !importCsv.trim()} onClick={onImportSubmit}>
              {importSubmitting ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <Input placeholder="Tag name" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
          <DialogFooter>
            <Button type="button" disabled={!bulkTag.trim()} onClick={onBulkTag}>
              Add tag
            </Button>
          </DialogFooter>
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

      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Possible duplicates</DialogTitle>
            <DialogDescription>Matched by shared email address. Merging keeps the first contact.</DialogDescription>
          </DialogHeader>
          {duplicatesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !duplicateGroups || duplicateGroups.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No duplicates found.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {duplicateGroups.groups.map((group) => (
                <li key={group.value} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div className="text-sm">
                    <p className="text-foreground">{group.value}</p>
                    <p className="text-muted-foreground">
                      {group.contacts.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={mergingGroupValue === group.value}
                    onClick={() => onMergeGroup(group)}
                  >
                    {mergingGroupValue === group.value ? "Merging…" : "Merge"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
