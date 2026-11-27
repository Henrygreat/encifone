/** Mirrors ClientLifecycleStage in prisma/schema.prisma — keep in sync. */
export const CLIENT_LIFECYCLE_STAGES = [
  "PROSPECT",
  "QUALIFIED_PROSPECT",
  "OPPORTUNITY",
  "WON",
  "ONBOARDING",
  "ACTIVE",
  "GROWTH",
  "AT_RISK",
  "DORMANT",
  "OFFBOARDING",
  "FORMER",
] as const;

export const LIFECYCLE_STAGE_BADGE_VARIANT: Record<
  (typeof CLIENT_LIFECYCLE_STAGES)[number],
  "default" | "secondary" | "outline" | "destructive"
> = {
  PROSPECT: "outline",
  QUALIFIED_PROSPECT: "outline",
  OPPORTUNITY: "secondary",
  WON: "secondary",
  ONBOARDING: "secondary",
  ACTIVE: "default",
  GROWTH: "default",
  AT_RISK: "destructive",
  DORMANT: "destructive",
  OFFBOARDING: "outline",
  FORMER: "outline",
};
