import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "@/components/app-shell/nav-config";

const MODULE_VAR: Record<ModuleKey, string> = {
  overview: "var(--module-overview)",
  crm: "var(--module-crm)",
  sales: "var(--module-sales)",
  work: "var(--module-work)",
  intelligence: "var(--module-intelligence)",
  admin: "var(--module-admin)",
};

/**
 * One reusable visual component for every not-yet-built module (AI
 * workforce orchestration, Projects, Billing, Automation, Client portal,
 * Communications, Document management, ...) rather than seven bespoke
 * ones — per the brief's "reusable visual components for future modules."
 * Deliberately a pure presentational component: no backend, no route, no
 * fabricated data (CLAUDE.md rules 4/6). Use it as the body of a future
 * module's landing page once that module's real work begins; nothing
 * here implies the module itself is implemented.
 */
export function ModulePreviewCard({
  icon: Icon,
  title,
  description,
  accentModule,
  availableFrom,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accentModule: ModuleKey;
  availableFrom: string;
  className?: string;
}) {
  const accent = MODULE_VAR[accentModule];
  return (
    <Card
      className={cn("gradient-border flex flex-col gap-4 p-8 text-center", className)}
      style={{ "--gradient-border-from": accent, "--gradient-border-to": "var(--module-intelligence)" } as React.CSSProperties}
    >
      <div
        className="mx-auto flex size-14 items-center justify-center rounded-2xl"
        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
      >
        <Icon className="size-7" style={{ color: accent }} aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline" className="mx-auto">
        {availableFrom}
      </Badge>
    </Card>
  );
}
