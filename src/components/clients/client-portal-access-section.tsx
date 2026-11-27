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

interface PortalUser {
  id: string;
  email: string;
  name: string | null;
  status: "INVITED" | "ACTIVE" | "DISABLED";
}

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().max(200).optional(),
});
type InviteInput = z.infer<typeof inviteSchema>;

const STATUS_VARIANT: Record<PortalUser["status"], "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INVITED: "secondary",
  DISABLED: "outline",
};

export function ClientPortalAccessSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({ resolver: zodResolver(inviteSchema) });

  const { data, isLoading } = useQuery({
    queryKey: ["client-portal-users", clientId],
    queryFn: async (): Promise<{ portalUsers: PortalUser[] }> => {
      const res = await fetch(`/api/v1/clients/${clientId}/portal-users`);
      if (!res.ok) throw new Error("Could not load portal access.");
      return res.json();
    },
  });

  async function onInvite(input: InviteInput) {
    const res = await fetch(`/api/v1/clients/${clientId}/portal-users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not send this invite.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["client-portal-users", clientId] });
    setInviteUrl(result.inviteUrl);
    reset();
    toast.success(`Invited ${input.email}.`);
  }

  async function onDisable(portalUserId: string) {
    const res = await fetch(`/api/v1/portal-users/${portalUserId}/disable`, { method: "POST" });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not disable this portal user.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["client-portal-users", clientId] });
    toast.success("Portal access disabled.");
  }

  if (isLoading) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Portal access</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setInviteUrl(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a portal contact</DialogTitle>
              <DialogDescription>
                No email delivery is configured yet — you&apos;ll get a link to share with them directly.
              </DialogDescription>
            </DialogHeader>
            {inviteUrl ? (
              <div className="flex flex-col gap-2">
                <Label>Share this link with them</Label>
                <Input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>
            ) : (
              <form onSubmit={handleSubmit(onInvite)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="portal-email">Email</Label>
                  <Input id="portal-email" type="email" {...register("email")} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="portal-name">Name (optional)</Label>
                  <Input id="portal-name" {...register("name")} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Sending…" : "Send invite"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {!data?.portalUsers.length ? (
        <BentoEmptyState title="No portal access yet" description="Invite a contact to give them client-portal access." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.portalUsers.map((pu) => (
            <li key={pu.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-foreground">{pu.name ?? pu.email}</p>
                <p className="text-xs text-muted-foreground">{pu.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[pu.status]}>{pu.status}</Badge>
                {pu.status !== "DISABLED" && (
                  <Button size="sm" variant="ghost" onClick={() => onDisable(pu.id)}>
                    Disable
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
