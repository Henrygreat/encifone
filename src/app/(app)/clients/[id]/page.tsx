"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BentoGrid, BentoCard, BentoEmptyState } from "@/components/bento/bento-grid";
import { formatEnumLabel } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { CLIENT_LIFECYCLE_STAGES, LIFECYCLE_STAGE_BADGE_VARIANT } from "@/modules/clients/constants";

interface ClientDetail {
  id: string;
  name: string;
  lifecycleStage: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  company: { id: string; name: string; industry: string | null } | null;
  primaryContact: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
  owner: { user: { name: string | null; email: string } } | null;
  originatingOpportunity: { id: string; name: string; stage: { name: string } } | null;
  lifecycleHistory: { id: string; fromStage: string; toStage: string; changedAt: string }[];
}

interface RelatedOpportunity {
  id: string;
  name: string;
  status: string;
  valueMinor: number | null;
  currency: string;
  expectedCloseDate: string | null;
}

interface RelatedActivity {
  id: string;
  type: string;
  subject: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  owner: { user: { name: string | null; email: string } } | null;
}

interface ClientDetailResponse {
  client: ClientDetail;
  relatedOpportunities: RelatedOpportunity[];
  relatedActivities: RelatedActivity[];
}

export default function ClientWorkspacePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const queryClient = useQueryClient();
  const [transitioning, setTransitioning] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async (): Promise<ClientDetailResponse> => {
      const res = await fetch(`/api/v1/clients/${clientId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not load this client.");
      }
      return res.json();
    },
  });

  async function onTransition(toStage: string) {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/v1/clients/${clientId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Could not change lifecycle stage.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Moved to ${formatEnumLabel(toStage)}.`);
    } finally {
      setTransitioning(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 sm:col-span-6 lg:col-span-6" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Link href="/clients" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to clients
        </Link>
        <BentoEmptyState
          title="This client could not be loaded"
          description={error instanceof Error ? error.message : "It may not exist, or you may not have access."}
        />
      </div>
    );
  }

  const { client, relatedOpportunities, relatedActivities } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link href="/clients" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to clients
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback>{client.name[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{client.name}</h1>
            <p className="text-sm text-muted-foreground">
              {client.company?.name ?? "No linked company"}
              {client.owner ? ` · Owned by ${client.owner.user.name ?? client.owner.user.email}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              LIFECYCLE_STAGE_BADGE_VARIANT[client.lifecycleStage as keyof typeof LIFECYCLE_STAGE_BADGE_VARIANT] ??
              "outline"
            }
          >
            {formatEnumLabel(client.lifecycleStage)}
          </Badge>
          <Select value={client.lifecycleStage} onValueChange={onTransition} disabled={transitioning}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Move stage…" />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_LIFECYCLE_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatEnumLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <BentoGrid>
        <BentoCard colSpan={6} accentModule="crm">
          <h2 className="text-sm font-semibold text-foreground">Overview</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Company</dt>
              <dd className="text-foreground">{client.company?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Industry</dt>
              <dd className="text-foreground">{client.company?.industry ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Primary contact</dt>
              <dd className="text-foreground">
                {client.primaryContact
                  ? `${client.primaryContact.firstName} ${client.primaryContact.lastName}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contact role</dt>
              <dd className="text-foreground">{client.primaryContact?.jobTitle ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Originating deal</dt>
              <dd className="text-foreground">
                {client.originatingOpportunity
                  ? `${client.originatingOpportunity.name} (${client.originatingOpportunity.stage.name})`
                  : "Added directly"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Client since</dt>
              <dd className="text-foreground">{new Date(client.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
          {client.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {client.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {client.notes ? <p className="text-sm text-muted-foreground">{client.notes}</p> : null}
        </BentoCard>

        <BentoCard colSpan={6} accentModule="crm">
          <h2 className="text-sm font-semibold text-foreground">Lifecycle history</h2>
          {client.lifecycleHistory.length === 0 ? (
            <BentoEmptyState
              title="No stage changes yet"
              description="Every move through the client lifecycle will be recorded here."
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {client.lifecycleHistory.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {formatEnumLabel(entry.fromStage)} → {formatEnumLabel(entry.toStage)}
                  </span>
                  <span className="text-muted-foreground">{new Date(entry.changedAt).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </BentoCard>

        <BentoCard colSpan={6} accentModule="sales">
          <h2 className="text-sm font-semibold text-foreground">Related deals</h2>
          {relatedOpportunities.length === 0 ? (
            <BentoEmptyState
              title="No related deals"
              description="Deals tied to this client's company or primary contact will appear here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {relatedOpportunities.map((opp) => (
                <li key={opp.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-foreground">{opp.name}</p>
                    <p className="text-muted-foreground">{formatEnumLabel(opp.status)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-foreground">{formatMoneyMinor(opp.valueMinor, opp.currency)}</p>
                    {opp.expectedCloseDate ? (
                      <p className="text-muted-foreground">
                        Closes {new Date(opp.expectedCloseDate).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </BentoCard>

        <BentoCard colSpan={6} accentModule="crm">
          <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
          {relatedActivities.length === 0 ? (
            <BentoEmptyState
              title="No activity logged yet"
              description="Calls, emails, meetings and tasks logged against this client's contact or company will show up here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {relatedActivities.map((activity) => (
                <li key={activity.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-foreground">{activity.subject}</p>
                    <p className="text-muted-foreground">
                      {formatEnumLabel(activity.type)} · {formatEnumLabel(activity.status)}
                    </p>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(activity.dueAt ?? activity.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
