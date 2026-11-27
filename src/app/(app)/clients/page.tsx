"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { CLIENT_LIFECYCLE_STAGES, LIFECYCLE_STAGE_BADGE_VARIANT } from "@/modules/clients/constants";

interface CompanyOption {
  id: string;
  name: string;
}

interface ClientRow {
  id: string;
  name: string;
  lifecycleStage: string;
  company: { id: string; name: string } | null;
  primaryContact: { id: string; firstName: string; lastName: string } | null;
  owner: { user: { name: string | null; email: string } } | null;
}

interface ClientListResponse {
  items: ClientRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const quickCreateSchema = z.object({
  name: z.string().min(1, "Client name is required").max(200),
  companyId: z.string().optional(),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [lifecycleStage, setLifecycleStage] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", debouncedSearch, lifecycleStage, page],
    queryFn: async (): Promise<ClientListResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (lifecycleStage !== "ALL") params.set("lifecycleStage", lifecycleStage);
      const res = await fetch(`/api/v1/clients?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load clients.");
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
  } = useForm<QuickCreateInput>({ resolver: zodResolver(quickCreateSchema) });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, companyId: input.companyId || undefined }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create client.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    reset();
    setDialogOpen(false);
    toast.success(`${input.name} was added to your clients.`);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Won deals become clients automatically — this is their lifecycle from onboarding onward.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-crm)", color: "var(--module-on-accent)" }}>New client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a client</DialogTitle>
              <DialogDescription>
                For a client that didn&apos;t come from a won deal. It starts in the Won stage — move it
                through the lifecycle from its workspace.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Client name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
                  {isSubmitting ? "Adding…" : "Add client"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={lifecycleStage}
          onValueChange={(v) => {
            setPage(1);
            setLifecycleStage(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All lifecycle stages</SelectItem>
            {CLIENT_LIFECYCLE_STAGES.map((s) => (
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
            title="No clients yet"
            description="Clients are created automatically when a deal is won, or you can add one directly."
            action={<Button onClick={() => setDialogOpen(true)}>New client</Button>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Primary contact</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Lifecycle stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link href={`/clients/${client.id}`} className="flex items-center gap-2 hover:underline">
                        <Avatar size="sm">
                          <AvatarFallback>{client.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{client.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.company?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.primaryContact
                        ? `${client.primaryContact.firstName} ${client.primaryContact.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.owner?.user.name ?? client.owner?.user.email ?? "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          LIFECYCLE_STAGE_BADGE_VARIANT[
                            client.lifecycleStage as keyof typeof LIFECYCLE_STAGE_BADGE_VARIANT
                          ] ?? "outline"
                        }
                      >
                        {formatEnumLabel(client.lifecycleStage)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {data.page} of {data.totalPages} — {data.total} client{data.total === 1 ? "" : "s"}
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
