"use client";

import { useState } from "react";
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
import { CONTACT_STATUSES } from "@/modules/crm/constants";

interface CompanyOption {
  id: string;
  name: string;
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            People you do business with across your organisation.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-crm)" }}>New contact</Button>
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
    </div>
  );
}
