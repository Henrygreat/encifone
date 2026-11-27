/** Mirrors ProposalStatus in prisma/schema.prisma. */
export const PROPOSAL_STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] as const;

export const PROPOSAL_STATUS_BADGE_VARIANT: Record<
  (typeof PROPOSAL_STATUSES)[number],
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  SENT: "secondary",
  VIEWED: "secondary",
  ACCEPTED: "default",
  DECLINED: "destructive",
  EXPIRED: "destructive",
};
