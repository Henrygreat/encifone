"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnumLabel } from "@/lib/utils";
import { CONTRACT_STATUS_BADGE_VARIANT } from "@/modules/contracts/constants";
import { branding } from "@/config/branding";

interface PublicContract {
  id: string;
  title: string;
  status: string;
  expiresAt: string | null;
  organisation: { name: string };
  versions: { versionNumber: number; content: string }[];
}

const RESPONDED_STATUSES = new Set(["SIGNED", "DECLINED"]);

export default function PublicContractPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const queryClient = useQueryClient();
  const [responding, setResponding] = useState(false);
  const [signerName, setSignerName] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-contract", token],
    queryFn: async (): Promise<PublicContract> => {
      const res = await fetch(`/api/v1/public/contracts/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "This contract link could not be opened.");
      }
      return res.json();
    },
  });

  async function onSign() {
    if (!signerName.trim()) return;
    setResponding(true);
    try {
      const res = await fetch(`/api/v1/public/contracts/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: signerName.trim() }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not record your signature.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["public-contract", token] });
      toast.success("Thank you — the contract has been signed.");
    } finally {
      setResponding(false);
    }
  }

  async function onDecline() {
    setResponding(true);
    try {
      const res = await fetch(`/api/v1/public/contracts/${token}/decline`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not record your response.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["public-contract", token] });
      toast.success("Response recorded.");
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="theme-client-portal min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">{branding.productName}</p>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-foreground">
              {error instanceof Error ? error.message : "This contract link could not be opened."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 shadow-elevated">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-foreground">{data.title}</h1>
                <p className="text-sm text-muted-foreground">From {data.organisation.name}</p>
              </div>
              <Badge
                variant={
                  CONTRACT_STATUS_BADGE_VARIANT[data.status as keyof typeof CONTRACT_STATUS_BADGE_VARIANT] ??
                  "outline"
                }
              >
                {formatEnumLabel(data.status)}
              </Badge>
            </div>

            <div className="mt-6 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground">
              {data.versions[0]?.content ?? "No content."}
            </div>

            {data.expiresAt ? (
              <p className="mt-2 text-right text-xs text-muted-foreground">
                Expires {new Date(data.expiresAt).toLocaleDateString()}
              </p>
            ) : null}

            {RESPONDED_STATUSES.has(data.status) ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                You already responded to this contract.
              </p>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="flex w-full max-w-xs flex-col gap-1.5">
                  <Label htmlFor="signerName">Type your full legal name to sign</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" disabled={responding} onClick={onDecline}>
                    Decline
                  </Button>
                  <Button disabled={responding || !signerName.trim()} onClick={onSign}>
                    Sign contract
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
