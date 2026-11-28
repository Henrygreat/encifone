"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEnumLabel } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { PROPOSAL_STATUS_BADGE_VARIANT } from "@/modules/proposals/constants";
import { branding } from "@/config/branding";

interface ProposalLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

interface PublicProposal {
  id: string;
  title: string;
  status: string;
  currency: string;
  expiresAt: string | null;
  organisation: { name: string };
  versions: { versionNumber: number; lines: ProposalLine[] }[];
}

const RESPONDED_STATUSES = new Set(["ACCEPTED", "DECLINED"]);

export default function PublicProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const queryClient = useQueryClient();
  const [responding, setResponding] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: async (): Promise<PublicProposal> => {
      const res = await fetch(`/api/v1/public/proposals/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "This proposal link could not be opened.");
      }
      return res.json();
    },
  });

  async function onRespond(response: "ACCEPTED" | "DECLINED") {
    setResponding(true);
    try {
      const res = await fetch(`/api/v1/public/proposals/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not record your response.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["public-proposal", token] });
      toast.success(response === "ACCEPTED" ? "Thank you — the proposal has been accepted." : "Response recorded.");
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="theme-client-portal min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {branding.poweredBy && <p className="text-center text-sm text-muted-foreground">{branding.poweredBy}</p>}

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-foreground">
              {error instanceof Error ? error.message : "This proposal link could not be opened."}
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
                  PROPOSAL_STATUS_BADGE_VARIANT[data.status as keyof typeof PROPOSAL_STATUS_BADGE_VARIANT] ??
                  "outline"
                }
              >
                {formatEnumLabel(data.status)}
              </Badge>
            </div>

            <Table className="mt-6">
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.versions[0]?.lines ?? []).map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell className="text-right">{formatMoneyMinor(line.unitPriceMinor, data.currency)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoneyMinor(line.unitPriceMinor * line.quantity, data.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold text-foreground">
                {formatMoneyMinor(
                  (data.versions[0]?.lines ?? []).reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0),
                  data.currency
                )}
              </span>
            </div>

            {data.expiresAt ? (
              <p className="mt-2 text-right text-xs text-muted-foreground">
                Expires {new Date(data.expiresAt).toLocaleDateString()}
              </p>
            ) : null}

            {RESPONDED_STATUSES.has(data.status) ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                You already responded to this proposal.
              </p>
            ) : (
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="outline" disabled={responding} onClick={() => onRespond("DECLINED")}>
                  Decline
                </Button>
                <Button disabled={responding} onClick={() => onRespond("ACCEPTED")}>
                  Accept proposal
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
