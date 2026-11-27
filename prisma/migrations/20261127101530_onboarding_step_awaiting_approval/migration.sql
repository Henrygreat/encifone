-- Adds the AWAITING_APPROVAL step status (a requiresApproval=true step
-- the client has submitted, pending an internal reviewer's decision)
-- and a reviewNote field (set on either an approval or a rejection, so
-- a rejected step is never sent back to the client with no explanation).

-- AlterEnum
ALTER TYPE "OnboardingStepStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterTable
ALTER TABLE "ClientOnboardingStep" ADD COLUMN     "reviewNote" TEXT;
