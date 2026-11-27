import { prisma } from "@/lib/prisma";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { getLead } from "@/modules/crm/service";
import { getOpportunity } from "@/modules/sales/service";
import { getClient } from "@/modules/clients/service";
import { calculateLeadScore } from "@/modules/intelligence/lead-scoring";
import { completeForOrganisation } from "@/lib/ai-gateway";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

export interface AIResult {
  narrative: string;
  provider: string;
  model: string;
}

/** Every function below returns a deterministic result unconditionally,
 * plus `ai: null` when AI isn't configured/enabled for this org or the
 * call failed — never a thrown error, never a fabricated narrative in
 * the deterministic result's place (docs/AI_ARCHITECTURE.md §8). */
async function tryAI(organisationId: string, feature: string, system: string, facts: unknown, maxTokens = 350): Promise<AIResult | null> {
  const result = await completeForOrganisation(organisationId, feature, {
    system,
    prompt: JSON.stringify(facts),
    maxTokens,
  });
  if (!result) return null;
  return { narrative: result.text.trim(), provider: result.provider, model: result.model };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// --- Lead qualification ---

export async function getLeadQualification(acting: ActiveMembership, leadId: string) {
  requireCapability(acting, Capability.CRM_VIEW);
  const lead = await getLead(acting, leadId);
  const deterministic = calculateLeadScore(lead);

  const ai = await tryAI(
    acting.organisationId,
    "lead_qualification",
    "You are a B2B sales qualification assistant. Given structured facts about a lead, write a concise 2-3 sentence qualification narrative and one recommended next step. Base your answer only on the facts given — never invent a detail that isn't present, and say so explicitly if the facts are too sparse to say much.",
    {
      companyName: lead.companyName,
      source: lead.source,
      priority: lead.priority,
      estimatedValueMinor: lead.estimatedValueMinor,
      currency: lead.currency,
      daysSinceCreated: Math.floor((Date.now() - lead.createdAt.getTime()) / MS_PER_DAY),
      deterministicScore: deterministic.score,
      scoreFactors: deterministic.factors,
    },
    300
  );

  return { deterministic, ai };
}

// --- Deal risk analysis ---

export interface DeterministicRiskSignal {
  level: "low" | "medium" | "high";
  reasons: string[];
}

function computeDeterministicDealRisk(
  expectedCloseDate: Date | null,
  activityCount: number,
  daysSinceLastActivity: number | null
): DeterministicRiskSignal {
  const reasons: string[] = [];
  let riskPoints = 0;

  if (activityCount === 0) {
    reasons.push("No activity has ever been logged against this deal.");
    riskPoints += 2;
  } else if (daysSinceLastActivity !== null && daysSinceLastActivity > 14) {
    reasons.push(`No activity logged in the last ${daysSinceLastActivity} days.`);
    riskPoints += 1;
  }

  if (expectedCloseDate) {
    const daysToClose = Math.floor((expectedCloseDate.getTime() - Date.now()) / MS_PER_DAY);
    if (daysToClose < 0) {
      reasons.push("The expected close date has already passed.");
      riskPoints += 2;
    } else if (daysToClose <= 7) {
      reasons.push(`Expected to close in ${daysToClose} day(s).`);
      riskPoints += 1;
    }
  }

  if (reasons.length === 0) {
    reasons.push("No risk indicators detected from the available data.");
  }

  const level: DeterministicRiskSignal["level"] = riskPoints >= 3 ? "high" : riskPoints >= 1 ? "medium" : "low";
  return { level, reasons };
}

export async function getDealRiskAssessment(acting: ActiveMembership, opportunityId: string) {
  requireCapability(acting, Capability.CRM_VIEW);
  const opportunity = await getOpportunity(acting, opportunityId);

  const [activityCount, lastActivity] = await Promise.all([
    prisma.activity.count({ where: { organisationId: acting.organisationId, opportunityId } }),
    prisma.activity.findFirst({
      where: { organisationId: acting.organisationId, opportunityId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const daysSinceLastActivity = lastActivity
    ? Math.floor((Date.now() - lastActivity.createdAt.getTime()) / MS_PER_DAY)
    : null;

  const deterministic = computeDeterministicDealRisk(opportunity.expectedCloseDate, activityCount, daysSinceLastActivity);

  const ai = await tryAI(
    acting.organisationId,
    "deal_risk",
    "You are a B2B sales-deal risk analyst. Given structured facts about a deal, write a concise 2-3 sentence risk assessment. Base your answer only on the facts given — never invent a detail that isn't present.",
    {
      dealName: opportunity.name,
      stage: opportunity.stage.name,
      valueMinor: opportunity.valueMinor,
      currency: opportunity.currency,
      probability: opportunity.probability ?? opportunity.stage.probability,
      expectedCloseDate: opportunity.expectedCloseDate,
      activityCount,
      daysSinceLastActivity,
      deterministicRisk: deterministic,
    },
    300
  );

  return { deterministic, ai };
}

// --- Recommended next actions ---

export type NextBestActionEntityType = "LEAD" | "OPPORTUNITY" | "CLIENT";

export async function getNextBestActions(acting: ActiveMembership, entityType: NextBestActionEntityType, entityId: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const deterministic: string[] = [];
  let facts: Record<string, unknown>;

  if (entityType === "LEAD") {
    const lead = await getLead(acting, entityId);
    if (lead.status === "NEW") deterministic.push("Make first contact — this lead hasn't been contacted yet.");
    if (!lead.nextFollowUpAt) deterministic.push("Schedule a follow-up — none is currently set.");
    facts = { type: "LEAD", status: lead.status, priority: lead.priority, score: lead.score, source: lead.source };
  } else if (entityType === "OPPORTUNITY") {
    const opportunity = await getOpportunity(acting, entityId);
    const activityCount = await prisma.activity.count({
      where: { organisationId: acting.organisationId, opportunityId: entityId },
    });
    if (activityCount === 0) deterministic.push("Log an activity — nothing has been recorded against this deal yet.");
    if (!opportunity.expectedCloseDate) deterministic.push("Set an expected close date.");
    facts = { type: "OPPORTUNITY", stage: opportunity.stage.name, activityCount, probability: opportunity.probability };
  } else {
    const { client, relatedActivities, relatedOpportunities } = await getClient(acting, entityId);
    if (relatedActivities.length === 0) deterministic.push("Log an activity — this client has no recorded activity yet.");
    const openDeals = relatedOpportunities.filter((o) => o.status === "OPEN");
    if (openDeals.length > 0) deterministic.push(`Follow up on ${openDeals.length} open deal(s) linked to this client.`);
    facts = { type: "CLIENT", lifecycleStage: client.lifecycleStage, activityCount: relatedActivities.length };
  }

  if (deterministic.length === 0) {
    deterministic.push("No obvious gaps detected from the available data — review manually for a qualitative next step.");
  }

  const ai = await tryAI(
    acting.organisationId,
    "next_best_action",
    "You are a B2B sales assistant. Given structured facts about a CRM record, suggest up to 3 concrete next actions a salesperson should take, as a short list. Base your answer only on the facts given — never invent a detail that isn't present.",
    facts,
    300
  );

  return { deterministic, ai };
}

// --- Client relationship summary ---

export async function getClientSummary(acting: ActiveMembership, clientId: string) {
  requireCapability(acting, Capability.CRM_VIEW);
  const { client, relatedOpportunities, relatedActivities } = await getClient(acting, clientId);

  const facts = {
    name: client.name,
    lifecycleStage: client.lifecycleStage,
    companyName: client.company?.name ?? null,
    primaryContactName: client.primaryContact
      ? `${client.primaryContact.firstName} ${client.primaryContact.lastName}`
      : null,
    clientSince: client.createdAt,
    openDealsCount: relatedOpportunities.filter((o) => o.status === "OPEN").length,
    wonDealsCount: relatedOpportunities.filter((o) => o.status === "WON").length,
    totalActivityCount: relatedActivities.length,
    lastActivitySubject: relatedActivities[0]?.subject ?? null,
    lastActivityAt: relatedActivities[0]?.createdAt ?? null,
  };

  const ai = await tryAI(
    acting.organisationId,
    "client_summary",
    "You are a client-relationship assistant. Given structured facts about a client, write a concise 3-4 sentence summary of the relationship status for an account manager. Base your answer only on the facts given — if information is missing, say so rather than guessing.",
    facts,
    350
  );

  return { facts, ai };
}
