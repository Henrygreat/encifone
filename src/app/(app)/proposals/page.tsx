"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { formatMoneyMinor } from "@/lib/money";
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_BADGE_VARIANT } from "@/modules/proposals/constants";

interface CompanyOption {
  id: string;
  name: string;
}

interface ProposalLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

interface ProposalRow {
  id: string;
  title: string;
  status: string;
  currency: string;
  createdAt: string;
  publicToken: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  versions: { lines: ProposalLine[] }[];
}

interface ProposalListResponse {
  items: ProposalRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Plain strings (not z.coerce.number()) to keep react-hook-form's resolver
// input/output types aligned — see src/app/(app)/deals/page.tsx's
// valueMajor field for the same pattern. Parsed to numbers at submit time.
const lineSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.string().regex(/^\d+$/, "Whole number"),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "e.g. 150 or 150.50"),
});

const quickCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  companyId: z.string().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

function proposalTotalMinor(proposal: ProposalRow): number {
  const latest = proposal.versions[0];
  if (!latest) return 0;
  return latest.lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
}

export default function ProposalsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["proposals"],
    queryFn: async (): Promise<ProposalListResponse> => {
      const res = await fetch(`/api/v1/proposals?pageSize=100`);
      if (!res.ok) throw new Error("Could not load proposals.");
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

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({
    resolver: zodResolver(quickCreateSchema),
    defaultValues: { lines: [{ description: "", quantity: "1", unitPrice: "0" }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        companyId: input.companyId || undefined,
        lines: input.lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPriceMinor: Math.round(Number(line.unitPrice) * 100),
        })),
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create the proposal.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["proposals"] });
    reset({ lines: [{ description: "", quantity: "1", unitPrice: "0" }] });
    setCreateOpen(false);
    toast.success(`${input.title} was created as a draft.`);
  }

  async function onStatusChange(proposal: ProposalRow, status: string) {
    const res = await fetch(`/api/v1/proposals/${proposal.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not change status.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["proposals"] });
    toast.success(`${proposal.title} is now ${formatEnumLabel(status)}.`);
  }

  async function onCopyLink(proposal: ProposalRow) {
    const res = await fetch(`/api/v1/proposals/${proposal.id}/public-link`, { method: "POST" });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create a public link.");
      return;
    }
    const url = `${window.location.origin}/proposal/${result.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public link copied to clipboard.");
    } catch {
      toast.success(url);
    }
    await queryClient.invalidateQueries({ queryKey: ["proposals"] });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Draft, send, and track client proposals — every edit after sending is a new version.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-sales)", color: "var(--module-on-accent)" }}>New proposal</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create a proposal</DialogTitle>
              <DialogDescription>Starts as a draft — send it once you&apos;re ready.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" {...register("title")} />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
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

              <div className="flex flex-col gap-2">
                <Label>Line items</Label>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Input placeholder="Description" {...register(`lines.${index}.description`)} />
                    </div>
                    <div className="flex w-20 flex-col gap-1">
                      <Input type="number" min="1" placeholder="Qty" {...register(`lines.${index}.quantity`)} />
                    </div>
                    <div className="flex w-28 flex-col gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Unit price"
                        {...register(`lines.${index}.unitPrice`)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {errors.lines?.message && <p className="text-xs text-destructive">{errors.lines.message}</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => append({ description: "", quantity: "1", unitPrice: "0" })}
                >
                  <Plus className="size-4" /> Add line
                </Button>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create proposal"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
            title="No proposals yet"
            description="Build a proposal from your service catalogue and track it through to acceptance."
            action={<Button onClick={() => setCreateOpen(true)}>New proposal</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proposal</TableHead>
                <TableHead>Company / Contact</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell className="font-medium text-foreground">{proposal.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {proposal.company?.name ??
                      (proposal.contact ? `${proposal.contact.firstName} ${proposal.contact.lastName}` : "—")}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatMoneyMinor(proposalTotalMinor(proposal), proposal.currency)}
                  </TableCell>
                  <TableCell>
                    <Select value={proposal.status} onValueChange={(v) => onStatusChange(proposal, v)}>
                      <SelectTrigger className="h-7 w-36 border-none bg-transparent px-0 shadow-none">
                        <Badge
                          variant={
                            PROPOSAL_STATUS_BADGE_VARIANT[
                              proposal.status as keyof typeof PROPOSAL_STATUS_BADGE_VARIANT
                            ] ?? "outline"
                          }
                        >
                          {formatEnumLabel(proposal.status)}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {PROPOSAL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {formatEnumLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onCopyLink(proposal)}>
                      Copy public link
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
