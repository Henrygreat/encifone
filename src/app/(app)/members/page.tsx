"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEMBERSHIP_ROLES, formatRoleLabel } from "@/modules/identity/roles";

interface MemberRow {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

export default function MembersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("TEAM_MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["memberships"],
    queryFn: async (): Promise<{ members: MemberRow[] }> => {
      const res = await fetch("/api/v1/memberships");
      if (!res.ok) throw new Error("Could not load members.");
      return res.json();
    },
  });

  async function sendInvite() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/memberships/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not send invite.");
        return;
      }
      const link = `${window.location.origin}/accept-invite?token=${result.inviteToken}`;
      setLastInviteLink(link);
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      setEmail("");
      toast.success("Invite created — share the link below (email delivery isn't wired up yet).");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Organisation Settings
          </h1>
          <p className="text-sm text-muted-foreground">Members of your active organisation.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Invite member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                No email provider is configured yet (docs/MASTER_ROADMAP.md) — you&apos;ll get a link to
                share with them directly.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBERSHIP_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {formatRoleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lastInviteLink && (
                <div className="rounded-md border border-border bg-muted p-3 text-xs break-all text-muted-foreground">
                  {lastInviteLink}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={sendInvite} disabled={submitting || !email}>
                {submitting ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.members.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No members yet.
              </TableCell>
            </TableRow>
          )}
          {data?.members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.user.name ?? "—"}</TableCell>
              <TableCell>{member.user.email}</TableCell>
              <TableCell>{formatRoleLabel(member.role)}</TableCell>
              <TableCell>
                <Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>
                  {member.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
