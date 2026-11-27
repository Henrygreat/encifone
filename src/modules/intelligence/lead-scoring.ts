import type { Lead } from "@prisma/client";

export interface LeadScoreFactor {
  label: string;
  points: number;
}

export interface LeadScoreResult {
  score: number;
  factors: LeadScoreFactor[];
}

/**
 * Deterministic, explainable lead scoring — no AI provider involved or
 * required. Per docs/AI_ARCHITECTURE.md §9 ("default to transparent
 * statistical methods... given typically small per-tenant datasets") and
 * §8 ("show the factors/weights and evidence used, not just a final
 * number"). This is the part of Phase 2.8 that doesn't need the (not yet
 * built) AI gateway or a configured provider key — see docs/DECISION_LOG.md.
 *
 * Deliberately excludes any protected characteristic (name, inferred
 * ethnicity/gender, etc.) as a scoring input — docs/MASTER_ROADMAP.md 2.8's
 * own "explainable, no protected characteristics" requirement.
 */
const HIGH_VALUE_SOURCES = new Set(["referral", "existing client", "partner"]);
const RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function calculateLeadScore(
  lead: Pick<
    Lead,
    "email" | "phone" | "companyName" | "source" | "priority" | "estimatedValueMinor" | "nextFollowUpAt" | "createdAt"
  >
): LeadScoreResult {
  const factors: LeadScoreFactor[] = [];

  if (lead.email) factors.push({ label: "Has email", points: 15 });
  if (lead.phone) factors.push({ label: "Has phone", points: 10 });
  if (lead.companyName) factors.push({ label: "Company identified", points: 10 });

  if (lead.source) {
    const isHighValueSource = HIGH_VALUE_SOURCES.has(lead.source.trim().toLowerCase());
    factors.push({
      label: isHighValueSource ? `High-value source (${lead.source})` : `Source recorded (${lead.source})`,
      points: isHighValueSource ? 20 : 10,
    });
  }

  if (lead.priority === "HIGH") factors.push({ label: "Marked high priority", points: 15 });
  else if (lead.priority === "MEDIUM") factors.push({ label: "Marked medium priority", points: 5 });

  if (lead.estimatedValueMinor && lead.estimatedValueMinor > 0) {
    factors.push({ label: "Estimated value recorded", points: 10 });
  }

  if (lead.nextFollowUpAt) factors.push({ label: "Follow-up scheduled", points: 5 });

  const ageMs = Date.now() - lead.createdAt.getTime();
  if (ageMs <= RECENCY_WINDOW_MS) factors.push({ label: "Created within the last 7 days", points: 10 });

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  return { score: Math.min(100, rawScore), factors };
}
