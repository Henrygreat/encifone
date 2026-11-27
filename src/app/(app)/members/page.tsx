"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/ui/page-header";
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

interface OrganisationSettings {
  conversionRequiresContract: boolean;
  conversionRequiresPayment: boolean;
}

const AI_PROVIDERS = ["ANTHROPIC", "OPENAI", "GOOGLE", "OPENROUTER"] as const;

interface AIConfig {
  provider: string | null;
  model: string | null;
  enabled: boolean;
  hasApiKey: boolean;
}

interface AIUsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export default function MembersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("TEAM_MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string>("ANTHROPIC");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["memberships"],
    queryFn: async (): Promise<{ members: MemberRow[] }> => {
      const res = await fetch("/api/v1/memberships");
      if (!res.ok) throw new Error("Could not load members.");
      return res.json();
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["organisation-settings"],
    queryFn: async (): Promise<OrganisationSettings> => {
      const res = await fetch("/api/v1/organisations/settings");
      if (!res.ok) throw new Error("Could not load organisation settings.");
      return res.json();
    },
  });

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config"],
    queryFn: async (): Promise<AIConfig> => {
      const res = await fetch("/api/v1/ai/config");
      if (!res.ok) throw new Error("Could not load AI configuration.");
      return res.json();
    },
  });

  const { data: aiUsage } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: async (): Promise<{ summary: AIUsageSummary }> => {
      const res = await fetch("/api/v1/ai/usage?pageSize=1");
      if (!res.ok) throw new Error("Could not load AI usage.");
      return res.json();
    },
  });

  async function onToggleAIEnabled(value: boolean) {
    const res = await fetch("/api/v1/ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: value }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not update AI settings.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["ai-config"] });
    toast.success(value ? "AI features enabled." : "AI features disabled.");
  }

  async function onSaveAIConfig() {
    setAiSaving(true);
    try {
      const res = await fetch("/api/v1/ai/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim() || null,
          ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not save AI configuration.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      setAiApiKey("");
      toast.success("AI configuration saved.");
    } finally {
      setAiSaving(false);
    }
  }

  async function onClearAIKey() {
    const res = await fetch("/api/v1/ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: null }),
    });
    if (!res.ok) {
      const result = await res.json();
      toast.error(result.error ?? "Could not clear the API key.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["ai-config"] });
    toast.success("API key cleared — falling back to the platform key, if any.");
  }

  async function onToggleGate(field: "conversionRequiresContract" | "conversionRequiresPayment", value: boolean) {
    const res = await fetch("/api/v1/organisations/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not update this setting.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["organisation-settings"] });
    toast.success("Updated.");
  }

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
      <PageHeader
        title="Organisation Settings"
        description="Members of your active organisation."
        actions={
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
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Lead-to-client conversion rules</CardTitle>
          <CardDescription>
            By default, a deal becomes a client as soon as it enters a Won stage. Turn either of these on
            to require it first — the deal still shows as Won on the board, but no Client record is
            created until the requirement is met.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="require-contract" className="flex flex-col gap-0.5">
              <span>Require a signed contract</span>
              <span className="text-xs font-normal text-muted-foreground">
                Blocks conversion until a Contract linked to the deal is SIGNED.
              </span>
            </Label>
            <Switch
              id="require-contract"
              checked={settings?.conversionRequiresContract ?? false}
              onCheckedChange={(v) => onToggleGate("conversionRequiresContract", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="require-payment" className="flex flex-col gap-0.5">
              <span>Require a succeeded payment</span>
              <span className="text-xs font-normal text-muted-foreground">
                Blocks conversion until a Stripe payment linked to the deal succeeds.
              </span>
            </Label>
            <Switch
              id="require-payment"
              checked={settings?.conversionRequiresPayment ?? false}
              onCheckedChange={(v) => onToggleGate("conversionRequiresPayment", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI configuration</CardTitle>
          <CardDescription>
            Off by default. Your organisation&apos;s data is never sent to an AI provider until you enable
            this and choose a provider. Lead qualification, deal risk, next-best-action, and client
            summaries all fall back to a transparent, rule-based result when this is off — never a
            fabricated AI-sounding answer.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-enabled" className="flex flex-col gap-0.5">
              <span>Enable AI features</span>
              <span className="text-xs font-normal text-muted-foreground">
                {aiConfig?.hasApiKey
                  ? "Using your own API key."
                  : "Using the platform's key, if one is configured — otherwise AI stays off."}
              </span>
            </Label>
            <Switch
              id="ai-enabled"
              checked={aiConfig?.enabled ?? false}
              onCheckedChange={onToggleAIEnabled}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p} disabled={p !== "ANTHROPIC"}>
                      {p}
                      {p !== "ANTHROPIC" ? " (coming soon)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-model">Model (optional)</Label>
              <Input
                id="ai-model"
                placeholder={aiConfig?.model ?? "Provider default"}
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-api-key">
              API key {aiConfig?.hasApiKey && <Badge variant="outline" className="ml-1">Set</Badge>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="ai-api-key"
                type="password"
                placeholder={aiConfig?.hasApiKey ? "•••••••••••••••• (enter a new key to replace it)" : "sk-ant-…"}
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
              />
              {aiConfig?.hasApiKey && (
                <Button type="button" variant="outline" onClick={onClearAIKey}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Encrypted at rest. Never shown again once saved — you&apos;ll only see whether one is set.
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Usage (all time)</span>
            <span className="text-foreground">
              {aiUsage?.summary.totalCalls ?? 0} call{aiUsage?.summary.totalCalls === 1 ? "" : "s"} ·{" "}
              {(aiUsage?.summary.totalInputTokens ?? 0) + (aiUsage?.summary.totalOutputTokens ?? 0)} tokens
            </span>
          </div>

          <Button type="button" className="self-start" disabled={aiSaving} onClick={onSaveAIConfig}>
            {aiSaving ? "Saving…" : "Save AI configuration"}
          </Button>
        </CardContent>
      </Card>

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
