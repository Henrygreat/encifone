import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BentoEmptyState } from "@/components/bento/bento-grid";
import type { IntelligenceCoreState } from "@/components/three/ai-orb";

/**
 * The dashboard's "AI insights" panel — shows the organisation's real
 * configuration state (src/lib/ai-gateway), never a fabricated summary
 * or activity feed. When AI is enabled, points at the real features
 * (lead qualification, deal risk, next-best-action, client summaries)
 * rather than inventing a digest that doesn't exist yet.
 */
export function AIInsightCard({
  configured,
  provider,
  state,
  stateLabel,
}: {
  configured: boolean;
  provider?: string | null;
  state: IntelligenceCoreState;
  stateLabel: string;
}) {
  const badgeVariant = state === "error" ? "destructive" : state === "degraded" ? "secondary" : "outline";

  if (!configured) {
    return (
      <BentoEmptyState
        title="No AI provider configured"
        description="Lead qualification, deal risk, next-best-action, and client summaries will appear throughout the app once your organisation enables one — never fabricated figures in the meantime."
        action={
          <Link href="/members" className="text-sm font-medium text-primary hover:underline">
            Configure in Organisation Settings
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={badgeVariant}>{stateLabel}</Badge>
        <span className="text-xs text-muted-foreground">Provider: {provider ?? "Configured"}</span>
      </div>
      <p className="text-sm text-foreground">
        AI is enabled for your organisation{provider ? ` (${provider})` : ""}. Deterministic, explainable
        results are always shown first — the AI narrative is an optional addition, never a replacement.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/leads" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted">
          Lead qualification
        </Link>
        <Link href="/deals" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted">
          Deal risk
        </Link>
        <Link href="/clients" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted">
          Client summaries
        </Link>
      </div>
      <Badge variant="outline" className="self-start">
        Usage is tracked — see Organisation Settings
      </Badge>
    </div>
  );
}
