/** Mirrors ContractStatus/ContractTemplateStatus in prisma/schema.prisma. */
export const CONTRACT_STATUSES = ["DRAFT", "SENT", "VIEWED", "SIGNED", "DECLINED", "VOIDED", "EXPIRED"] as const;

export const CONTRACT_STATUS_BADGE_VARIANT: Record<
  (typeof CONTRACT_STATUSES)[number],
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  SENT: "secondary",
  VIEWED: "secondary",
  SIGNED: "default",
  DECLINED: "destructive",
  VOIDED: "destructive",
  EXPIRED: "destructive",
};
