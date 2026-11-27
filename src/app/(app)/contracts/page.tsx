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
import { Textarea } from "@/components/ui/textarea";
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
import { PageHeader } from "@/components/ui/page-header";
import { CONTRACT_STATUS_BADGE_VARIANT } from "@/modules/contracts/constants";
import { StatusBadge } from "@/components/ui/status-badge";

interface CompanyOption {
  id: string;
  name: string;
}

interface ContractTemplateOption {
  id: string;
  name: string;
}

interface SignatureRequestSummary {
  signerName: string;
  signerEmail: string;
  status: string;
}

interface ContractRow {
  id: string;
  title: string;
  status: string;
  publicToken: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  signatureRequests: SignatureRequestSummary[];
}

interface ContractListResponse {
  items: ContractRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const createSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    companyId: z.string().optional(),
    templateId: z.string().optional(),
    content: z.string().max(50_000).optional(),
  })
  .refine((v) => Boolean(v.templateId) || Boolean(v.content?.trim()), {
    message: "Provide content, or choose a template",
    path: ["content"],
  });
type CreateInput = z.infer<typeof createSchema>;

const sendSchema = z.object({
  signerName: z.string().min(1, "Required").max(200),
  signerEmail: z.string().email(),
});
type SendInput = z.infer<typeof sendSchema>;

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [sendingContract, setSendingContract] = useState<ContractRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async (): Promise<ContractListResponse> => {
      const res = await fetch(`/api/v1/contracts?pageSize=100`);
      if (!res.ok) throw new Error("Could not load contracts.");
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

  const { data: templates } = useQuery({
    queryKey: ["contract-templates"],
    queryFn: async (): Promise<{ items: ContractTemplateOption[] }> => {
      const res = await fetch(`/api/v1/contract-templates?pageSize=100`);
      if (!res.ok) throw new Error("Could not load contract templates.");
      return res.json();
    },
  });

  const createForm = useForm<CreateInput>({ resolver: zodResolver(createSchema) });
  const sendForm = useForm<SendInput>({ resolver: zodResolver(sendSchema) });

  async function onCreate(input: CreateInput) {
    const res = await fetch("/api/v1/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        companyId: input.companyId || undefined,
        templateId: input.templateId || undefined,
        content: input.content || undefined,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create the contract.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["contracts"] });
    createForm.reset();
    setCreateOpen(false);
    toast.success(`${input.title} was created as a draft.`);
  }

  async function onSend(input: SendInput) {
    if (!sendingContract) return;
    const res = await fetch(`/api/v1/contracts/${sendingContract.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not send this contract.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["contracts"] });
    sendForm.reset();
    setSendingContract(null);
    toast.success(`Sent to ${input.signerEmail} for signature.`);
  }

  async function onCopyLink(contract: ContractRow) {
    if (!contract.publicToken) {
      toast.error("Send this contract for signature first.");
      return;
    }
    const url = `${window.location.origin}/contract/${contract.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public link copied to clipboard.");
    } catch {
      toast.success(url);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Contracts"
        description="Draft, send for signature, and track contracts through to a signed agreement."
        actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-sales)", color: "var(--module-on-accent)" }}>New contract</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create a contract</DialogTitle>
              <DialogDescription>Starts as a draft — send it once you&apos;re ready.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" {...createForm.register("title")} />
                {createForm.formState.errors.title && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.title.message}</p>
                )}
              </div>
              {companies?.items?.length ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Company (optional)</Label>
                  <Controller
                    control={createForm.control}
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
              {templates?.items?.length ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Start from a template (optional)</Label>
                  <Controller
                    control={createForm.control}
                    name="templateId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Write content directly instead" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.items.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content">Content (skip if using a template)</Label>
                <Textarea id="content" rows={6} {...createForm.register("content")} />
                {createForm.formState.errors.content && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.content.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? "Creating…" : "Create contract"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <BentoEmptyState
            title="No contracts yet"
            description="Create a contract from a template or from scratch, then send it for signature."
            action={<Button onClick={() => setCreateOpen(true)}>New contract</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Company / Contact</TableHead>
                <TableHead>Signer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((contract) => {
                const latestSignatureRequest = contract.signatureRequests[0];
                const canSend = !["SIGNED", "VOIDED"].includes(contract.status);
                return (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium text-foreground">{contract.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {contract.company?.name ??
                        (contract.contact ? `${contract.contact.firstName} ${contract.contact.lastName}` : "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {latestSignatureRequest
                        ? `${latestSignatureRequest.signerName} (${latestSignatureRequest.signerEmail})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={contract.status} variantMap={CONTRACT_STATUS_BADGE_VARIANT} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canSend && (
                          <Button variant="outline" size="sm" onClick={() => setSendingContract(contract)}>
                            {contract.status === "DRAFT" ? "Send for signature" : "Resend"}
                          </Button>
                        )}
                        {contract.publicToken && (
                          <Button variant="outline" size="sm" onClick={() => onCopyLink(contract)}>
                            Copy public link
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(sendingContract)} onOpenChange={(open) => !open && setSendingContract(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send &ldquo;{sendingContract?.title}&rdquo; for signature</DialogTitle>
            <DialogDescription>
              The signer opens a secure public link and signs by typing their name — no account needed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendForm.handleSubmit(onSend)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signerName">Signer name</Label>
              <Input id="signerName" {...sendForm.register("signerName")} />
              {sendForm.formState.errors.signerName && (
                <p className="text-xs text-destructive">{sendForm.formState.errors.signerName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signerEmail">Signer email</Label>
              <Input id="signerEmail" type="email" {...sendForm.register("signerEmail")} />
              {sendForm.formState.errors.signerEmail && (
                <p className="text-xs text-destructive">{sendForm.formState.errors.signerEmail.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sendForm.formState.isSubmitting}>
                {sendForm.formState.isSubmitting ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
