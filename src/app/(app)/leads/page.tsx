"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Pre-qualification records — convert into a contact and company once qualified.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-crm)" }}>New lead</Button>
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
                        {/* Schema foundation only — real AI scoring is Phase 2.8; show the raw
                            stored value if one exists, never a fabricated figure. */}
                        {lead.score ?? "—"}
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
    </div>
  );
}
