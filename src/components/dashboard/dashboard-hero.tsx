import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BentoCard } from "@/components/bento/bento-grid";
import { AiOrb } from "@/components/three/ai-orb";
import type { IntelligenceCoreState } from "@/components/three/ai-orb";

function greeting(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The dashboard's single hero section (Aurora UI brief §6.1) — the
 * personalised greeting and the AI Intelligence Core combined into one
 * cohesive card instead of two separate Bento cells, so the Intelligence
 * Core reads as part of the welcome moment rather than a wasted side
 * panel. Fixed to a deliberately short height band (brief: 220-300px on
 * desktop) regardless of content, so it can never sprawl into "excessive
 * empty space" the way the old two-card layout did.
 */
export function DashboardHero({
  firstName,
  organisationName,
  summaryLine,
  quickActions,
  aiState,
  aiStatusLabel,
}: {
  firstName: string;
  organisationName: string;
  summaryLine: string;
  quickActions: ReactNode;
  aiState: IntelligenceCoreState;
  aiStatusLabel: string;
}) {
  return (
    <BentoCard
      colSpan={8}
      variant="glass"
      className="min-h-[210px] flex-row items-center justify-between gap-4 overflow-hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm font-medium" style={{ color: "var(--module-sales)" }}>
          {greeting(new Date().getHours())}, {firstName}
        </p>
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
          {organisationName}
        </h1>
        <p className="text-sm text-muted-foreground">{summaryLine}</p>
        <div className="mt-1 flex flex-wrap gap-2">{quickActions}</div>
      </div>

      <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
        <div className="relative size-28 sm:size-32 lg:size-36">
          <AiOrb className="size-full" state={aiState} />
        </div>
        <p className="text-xs font-medium text-foreground">Intelligence Core</p>
        <p className="text-[11px] text-muted-foreground">{aiStatusLabel}</p>
      </div>
    </BentoCard>
  );
}

export function HeroQuickAction({ href, icon: Icon, children, primary }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={primary ? undefined : "outline"}
      style={primary ? { background: "var(--module-crm)", color: "var(--module-on-accent)" } : undefined}
    >
      <Link href={href}>
        <Icon className="size-4" />
        {children}
      </Link>
    </Button>
  );
}
