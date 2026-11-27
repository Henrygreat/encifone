import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureClientFromWonOpportunity } from "@/modules/clients/service";
import { hasSignedContractForOpportunity } from "@/modules/contracts/service";
import { hasSucceededPaymentForOpportunity } from "@/modules/payments/service";
import { maybeAutoStartOnboarding } from "@/modules/onboarding/service";

/**
 * The single gated-conversion decision point for Phase 2.7
 * (docs/MASTER_ROADMAP.md) — kept in its own module rather than inside
 * clients/service.ts, contracts/service.ts, or payments/service.ts to
 * avoid a circular import between them (this module depends on all
 * three; none of them depend back on this one or on each other).
 *
 * Returns the created/existing Client if conversion proceeds, or `null`
 * if a required gate (contract signed / payment succeeded) isn't
 * satisfied yet — a null return is not an error, it means "still
 * waiting," and the caller (moveOpportunity, or a webhook handler once a
 * gate is later satisfied) simply does nothing further.
 *
 * Accepts an optional transaction client so src/modules/sales/service.ts's
 * moveOpportunity can call this from inside its own transaction for the
 * default (both gates off) case — preserving the exact atomic "Won stage
 * entered -> Client exists" guarantee that existed before gating was
 * introduced. When called from a webhook (a gate being satisfied
 * asynchronously, after the opportunity was already marked Won with no
 * Client yet), it runs outside any transaction against the plain client.
 */
export async function attemptGatedConversion(
  organisationId: string,
  opportunityId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const organisation = await tx.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { conversionRequiresContract: true, conversionRequiresPayment: true },
  });

  if (organisation.conversionRequiresContract) {
    const hasContract = await hasSignedContractForOpportunity(organisationId, opportunityId);
    if (!hasContract) return null;
  }
  if (organisation.conversionRequiresPayment) {
    const hasPayment = await hasSucceededPaymentForOpportunity(organisationId, opportunityId);
    if (!hasPayment) return null;
  }

  const client = await ensureClientFromWonOpportunity(tx, organisationId, opportunityId);

  // Opt-in only (Organisation.autoStartOnboarding, default false) and a
  // no-op if the org has no default OnboardingTemplate configured yet —
  // never fabricates an onboarding the org hasn't actually set up.
  await maybeAutoStartOnboarding(tx, organisationId, client.id);

  return client;
}
