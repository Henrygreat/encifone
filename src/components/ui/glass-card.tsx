import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The glass/gradient-border/elevated-shadow treatment BentoCard's
 * `variant="glass"` already applies inside a Bento grid — standalone for
 * surfaces that aren't in one (the public proposal/contract pages, a
 * floating panel, a modal). Renders as a plain card (no glass) outside
 * the Aurora theme, matching BentoCard's own restraint — Professional
 * Dark/Light don't get glassmorphism.
 */
export function GlassCard({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 shadow-elevated",
        "aurora:glass-panel aurora:gradient-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
