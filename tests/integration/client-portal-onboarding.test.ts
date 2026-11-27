import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// A minimal in-memory stand-in for next/headers' cookies() — this test
// file runs outside any Next.js request scope, so the real cookies()
// would throw. Each test that exercises the cookie-based login/session
// flow fully controls its own sequential set -> read -> clear within
// itself; beforeEach resets the jar so no state leaks between tests.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner, updateOrganisationSettings } from "@/modules/identity/service";
import { createOpportunity, ensureDefaultPipeline, moveOpportunity } from "@/modules/sales/service";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import {
  acceptClientPortalInvite,
  disableClientPortalUser,
  inviteClientPortalUser,
  loginPortalUser,
  requestClientPortalPasswordReset,
  resetClientPortalPassword,
  PORTAL_SESSION_COOKIE,
  PortalUnauthenticatedError,
  requireActivePortalSession,
} from "@/modules/portal/auth";
import {
  completeOnboardingStep,
  createOnboardingTemplate,
  getClientOnboarding,
  getPortalOnboarding,
  reviewOnboardingStep,
  startOnboarding,
} from "@/modules/onboarding/service";
import { membershipIdFor } from "../helpers/membership";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

async function freshOrgOwner(prefix: string): Promise<ActiveMembership> {
  const owner = await registerOwner({
    name: `${prefix} Owner`,
    email: uniqueEmail(prefix),
    password: "password123",
    organisationName: `${prefix} Org ${randomUUID()}`,
  });
  createdOrgIds.push(owner.organisationId);
  createdUserIds.push(owner.userId);
  return {
    userId: owner.userId,
    organisationId: owner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(owner.userId, owner.organisationId),
  };
}

async function freshWonClient(acting: ActiveMembership, name: string) {
  const pipeline = await ensureDefaultPipeline(acting);
  const newStage = pipeline.stages.find((s) => s.name === "New")!;
  const wonStage = pipeline.stages.find((s) => s.isWon)!;
  // Owned by the acting membership so the resulting Client.ownerId is
  // set — several tests below (notification targeting) depend on that.
  const deal = await createOpportunity(acting, {
    pipelineId: pipeline.id,
    stageId: newStage.id,
    name,
    ownerId: acting.membershipId,
  });
  const client = await attemptGatedConversion(acting.organisationId, deal.id);
  if (!client) {
    // Default (ungated) orgs create the Client synchronously inside
    // moveOpportunity itself — attemptGatedConversion above already
    // covers the gated path; fall back to the normal move for parity.
    await moveOpportunity(acting, deal.id, { stageId: wonStage.id, orderedIds: [deal.id] });
    const created = await prisma.client.findFirstOrThrow({ where: { originatingOpportunityId: deal.id } });
    return created;
  }
  return client;
}

beforeEach(() => cookieJar.clear());
afterEach(() => cookieJar.clear());

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.clientOnboardingStep.deleteMany({ where: { onboarding: { client: { organisationId: { in: createdOrgIds } } } } });
  await prisma.clientOnboarding.deleteMany({ where: { client: { organisationId: { in: createdOrgIds } } } });
  await prisma.onboardingTemplateStep.deleteMany({ where: { template: { organisationId: { in: createdOrgIds } } } });
  await prisma.onboardingTemplate.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.clientPortalPasswordResetToken.deleteMany({ where: { clientPortalUser: { organisationId: { in: createdOrgIds } } } });
  await prisma.clientPortalSession.deleteMany({ where: { clientPortalUser: { organisationId: { in: createdOrgIds } } } });
  await prisma.clientPortalInvite.deleteMany({ where: { clientPortalUser: { organisationId: { in: createdOrgIds } } } });
  await prisma.clientPortalUser.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.clientLifecycleHistory.deleteMany({ where: { client: { organisationId: { in: createdOrgIds } } } });
  await prisma.client.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunityStageHistory.deleteMany({ where: { opportunity: { organisationId: { in: createdOrgIds } } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("portal invite -> accept -> login -> session", () => {
  it("lets a client log in after accepting an invite, and resolves the correct session", async () => {
    const acting = await freshOrgOwner("Portal");
    const client = await freshWonClient(acting, `Portal Client ${randomUUID()}`);

    const email = uniqueEmail("portal-contact");
    const { inviteUrl } = await inviteClientPortalUser(acting, { clientId: client.id, email, name: "Portal Contact" });
    const token = new URL(inviteUrl).searchParams.get("token")!;

    await acceptClientPortalInvite({ token, password: "clientpass123" });
    const rawTokenAfterAccept = cookieJar.get(PORTAL_SESSION_COOKIE)!;
    expect(rawTokenAfterAccept).toBeTruthy();

    const session = await requireActivePortalSession();
    expect(session.clientId).toBe(client.id);
    expect(session.organisationId).toBe(acting.organisationId);

    // Logging in again (separately) with the same credentials works too.
    cookieJar.clear();
    await loginPortalUser(email, "clientpass123");
    const secondSession = await requireActivePortalSession();
    expect(secondSession.clientId).toBe(client.id);
  });

  it("rejects an invite token used twice (replay)", async () => {
    const acting = await freshOrgOwner("Replay");
    const client = await freshWonClient(acting, `Replay Client ${randomUUID()}`);
    const { inviteUrl } = await inviteClientPortalUser(acting, {
      clientId: client.id,
      email: uniqueEmail("replay-contact"),
    });
    const token = new URL(inviteUrl).searchParams.get("token")!;

    await acceptClientPortalInvite({ token, password: "clientpass123" });
    await expect(acceptClientPortalInvite({ token, password: "anotherpass123" })).rejects.toThrow(
      /invalid or has expired/
    );
  });

  it("rejects an expired invite token", async () => {
    const acting = await freshOrgOwner("Expiry");
    const client = await freshWonClient(acting, `Expiry Client ${randomUUID()}`);
    const { inviteUrl } = await inviteClientPortalUser(acting, {
      clientId: client.id,
      email: uniqueEmail("expiry-contact"),
    });
    const token = new URL(inviteUrl).searchParams.get("token")!;

    await prisma.clientPortalInvite.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptClientPortalInvite({ token, password: "clientpass123" })).rejects.toThrow(
      /invalid or has expired/
    );
  });

  it("rejects login before the invite has been accepted", async () => {
    const acting = await freshOrgOwner("Unaccepted");
    const client = await freshWonClient(acting, `Unaccepted Client ${randomUUID()}`);
    const email = uniqueEmail("unaccepted-contact");
    await inviteClientPortalUser(acting, { clientId: client.id, email });

    await expect(loginPortalUser(email, "whatever")).rejects.toThrow(/Invalid email or password/);
  });

  it("rejects the wrong password", async () => {
    const acting = await freshOrgOwner("WrongPass");
    const client = await freshWonClient(acting, `WrongPass Client ${randomUUID()}`);
    const email = uniqueEmail("wrongpass-contact");
    const { inviteUrl } = await inviteClientPortalUser(acting, { clientId: client.id, email });
    const token = new URL(inviteUrl).searchParams.get("token")!;
    await acceptClientPortalInvite({ token, password: "correctpass123" });
    cookieJar.clear();

    await expect(loginPortalUser(email, "wrongpass")).rejects.toThrow(/Invalid email or password/);
  });

  it("invalidates every session immediately when a portal user is disabled", async () => {
    const acting = await freshOrgOwner("Disable");
    const client = await freshWonClient(acting, `Disable Client ${randomUUID()}`);
    const email = uniqueEmail("disable-contact");
    const { inviteUrl, portalUser } = await inviteClientPortalUser(acting, { clientId: client.id, email });
    const token = new URL(inviteUrl).searchParams.get("token")!;
    await acceptClientPortalInvite({ token, password: "clientpass123" });

    await disableClientPortalUser(acting, portalUser.id);

    await expect(requireActivePortalSession()).rejects.toBeInstanceOf(PortalUnauthenticatedError);
  });

  it("rejects a missing session cookie", async () => {
    await expect(requireActivePortalSession()).rejects.toBeInstanceOf(PortalUnauthenticatedError);
  });

  it("rejects inviting a client in another organisation", async () => {
    const actingOrgA = await freshOrgOwner("CrossOrgA");
    const actingOrgB = await freshOrgOwner("CrossOrgB");
    const clientB = await freshWonClient(actingOrgB, `CrossOrg Client ${randomUUID()}`);

    await expect(
      inviteClientPortalUser(actingOrgA, { clientId: clientB.id, email: uniqueEmail("cross-org-contact") })
    ).rejects.toThrow(/not found/i);
  });

  it("resets password with a one-time token and invalidates previous sessions", async () => {
    const acting = await freshOrgOwner("ResetPassword");
    const client = await freshWonClient(acting, `Reset Client ${randomUUID()}`);
    const email = uniqueEmail("reset-contact");

    const { inviteUrl } = await inviteClientPortalUser(acting, { clientId: client.id, email });
    const inviteToken = new URL(inviteUrl).searchParams.get("token")!;
    await acceptClientPortalInvite({ token: inviteToken, password: "oldpass123" });

    const oldSessionCookie = cookieJar.get(PORTAL_SESSION_COOKIE);
    expect(oldSessionCookie).toBeTruthy();

    const resetRequest = await requestClientPortalPasswordReset(email);
    expect(resetRequest.requested).toBe(true);
    expect(resetRequest.resetUrl).toContain("/portal/reset-password?token=");
    const resetToken = new URL(resetRequest.resetUrl!).searchParams.get("token")!;

    cookieJar.clear();
    await resetClientPortalPassword({ token: resetToken, password: "newpass123" });
    const newSessionCookie = cookieJar.get(PORTAL_SESSION_COOKIE);
    expect(newSessionCookie).toBeTruthy();
    expect(newSessionCookie).not.toBe(oldSessionCookie);

    cookieJar.clear();
    await expect(loginPortalUser(email, "oldpass123")).rejects.toThrow(/Invalid email or password/);
    await loginPortalUser(email, "newpass123");
  });

  it("rejects expired or already-used password reset tokens", async () => {
    const acting = await freshOrgOwner("ResetExpiry");
    const client = await freshWonClient(acting, `Reset Expiry Client ${randomUUID()}`);
    const email = uniqueEmail("reset-expiry-contact");

    const { inviteUrl } = await inviteClientPortalUser(acting, { clientId: client.id, email });
    const inviteToken = new URL(inviteUrl).searchParams.get("token")!;
    await acceptClientPortalInvite({ token: inviteToken, password: "startpass123" });

    const resetRequest = await requestClientPortalPasswordReset(email);
    const resetToken = new URL(resetRequest.resetUrl!).searchParams.get("token")!;

    const tokenRow = await prisma.clientPortalPasswordResetToken.findFirstOrThrow({
      where: { clientPortalUser: { email } },
      orderBy: { createdAt: "desc" },
    });
    await prisma.clientPortalPasswordResetToken.update({ where: { id: tokenRow.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetClientPortalPassword({ token: resetToken, password: "newpass123" })).rejects.toThrow(
      /invalid or has expired/
    );

    const second = await requestClientPortalPasswordReset(email);
    const secondToken = new URL(second.resetUrl!).searchParams.get("token")!;
    await resetClientPortalPassword({ token: secondToken, password: "newpass123" });
    await expect(resetClientPortalPassword({ token: secondToken, password: "anotherpass123" })).rejects.toThrow(
      /invalid or has expired/
    );
  });
});

describe("onboarding lifecycle and isolation", () => {
  it("runs a full step lifecycle: client submits a requiresApproval step, internal rejects then approves, onboarding completes", async () => {
    const acting = await freshOrgOwner("Lifecycle");
    const client = await freshWonClient(acting, `Lifecycle Client ${randomUUID()}`);

    const template = await createOnboardingTemplate(acting, {
      name: "Standard onboarding",
      isDefault: false,
      steps: [
        { label: "Welcome", stepType: "WELCOME", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false },
        {
          label: "Submit company info",
          stepType: "CLIENT_INFO",
          assignedTo: "CLIENT",
          isMandatory: true,
          requiresApproval: true,
        },
        {
          label: "Internal review",
          stepType: "INTERNAL_REVIEW",
          assignedTo: "INTERNAL",
          isMandatory: true,
          requiresApproval: false,
        },
      ],
    });

    const onboarding = await startOnboarding(acting, client.id, template.id);
    const welcomeStep = onboarding.steps.find((s) => s.stepType === "WELCOME")!;
    const infoStep = onboarding.steps.find((s) => s.stepType === "CLIENT_INFO")!;
    const reviewStep = onboarding.steps.find((s) => s.stepType === "INTERNAL_REVIEW")!;

    const { inviteUrl } = await inviteClientPortalUser(acting, {
      clientId: client.id,
      email: uniqueEmail("lifecycle-contact"),
    });
    const inviteToken = new URL(inviteUrl).searchParams.get("token")!;
    const portalUserId = await acceptClientPortalInvite({ token: inviteToken, password: "clientpass123" });
    cookieJar.clear();
    const portalSession = { portalUserId, clientId: client.id, organisationId: acting.organisationId };

    // Client completes the simple step immediately.
    const completedWelcome = await completeOnboardingStep({ portalSession }, welcomeStep.id);
    expect(completedWelcome.status).toBe("COMPLETED");

    // The client's own internal owner gets notified — never the client
    // (who already knows; they just did it) and never some other portal
    // user by mistake.
    const ownerNotifications = await prisma.notification.findMany({
      where: { recipientMembershipId: acting.membershipId, type: "ONBOARDING_STEP_COMPLETED" },
    });
    expect(ownerNotifications.some((n) => n.title.includes("Welcome"))).toBe(true);
    const wrongRecipientNotifications = await prisma.notification.findMany({
      where: {
        organisationId: acting.organisationId,
        recipientType: "CLIENT_PORTAL_USER",
        type: "ONBOARDING_STEP_COMPLETED",
      },
    });
    expect(wrongRecipientNotifications).toHaveLength(0);

    // Client submits the approval-gated step -> AWAITING_APPROVAL, not COMPLETED.
    const submitted = await completeOnboardingStep({ portalSession }, infoStep.id, { companyName: "Acme" });
    expect(submitted.status).toBe("AWAITING_APPROVAL");

    // A client cannot complete an INTERNAL-assigned step.
    await expect(completeOnboardingStep({ portalSession }, reviewStep.id)).rejects.toBeInstanceOf(ForbiddenError);

    // Internal rejects the submission -> back to PENDING with a note.
    const rejected = await reviewOnboardingStep(acting, infoStep.id, "REJECT", "Please add a VAT number.");
    expect(rejected.status).toBe("PENDING");
    expect(rejected.reviewNote).toMatch(/VAT/);

    // Client resubmits and internal approves this time.
    await completeOnboardingStep({ portalSession }, infoStep.id, { companyName: "Acme", vat: "GB123" });
    const approved = await reviewOnboardingStep(acting, infoStep.id, "APPROVE");
    expect(approved.status).toBe("COMPLETED");

    // Internal completes its own assigned step.
    await completeOnboardingStep({ acting }, reviewStep.id);

    const finalOnboarding = await getClientOnboarding(acting, client.id);
    expect(finalOnboarding!.status).toBe("COMPLETED");
  });

  it("isolates onboarding data between two different clients' portal sessions", async () => {
    const acting = await freshOrgOwner("Isolation");
    const clientA = await freshWonClient(acting, `Isolation Client A ${randomUUID()}`);
    const clientB = await freshWonClient(acting, `Isolation Client B ${randomUUID()}`);

    const template = await createOnboardingTemplate(acting, {
      name: "Iso template",
      isDefault: false,
      steps: [{ label: "Step", stepType: "WELCOME", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false }],
    });

    const onboardingA = await startOnboarding(acting, clientA.id, template.id);
    await startOnboarding(acting, clientB.id, template.id);

    const sessionA = { portalUserId: "a", clientId: clientA.id, organisationId: acting.organisationId };
    const sessionB = { portalUserId: "b", clientId: clientB.id, organisationId: acting.organisationId };

    const viewFromA = await getPortalOnboarding(sessionA);
    const viewFromB = await getPortalOnboarding(sessionB);
    expect(viewFromA!.clientId).toBe(clientA.id);
    expect(viewFromB!.clientId).toBe(clientB.id);
    expect(viewFromB!.clientId).not.toBe(clientA.id);

    // B's session cannot touch A's step directly even by id.
    const stepFromA = onboardingA.steps[0];
    await expect(completeOnboardingStep({ portalSession: sessionB }, stepFromA.id)).rejects.toThrow(/not found/i);
  });

  it("rejects starting a second onboarding while one is already in progress", async () => {
    const acting = await freshOrgOwner("DoubleStart");
    const client = await freshWonClient(acting, `DoubleStart Client ${randomUUID()}`);
    const template = await createOnboardingTemplate(acting, {
      name: "Double-start template",
      isDefault: false,
      steps: [{ label: "Step", stepType: "WELCOME", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false }],
    });

    await startOnboarding(acting, client.id, template.id);
    await expect(startOnboarding(acting, client.id, template.id)).rejects.toThrow(/already has an onboarding/);
  });

  it("auto-starts onboarding on client creation only when the org has opted in and has a default template", async () => {
    const acting = await freshOrgOwner("AutoStart");

    // Not yet opted in: no onboarding should exist.
    const pipeline = await ensureDefaultPipeline(acting);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const dealBefore = await createOpportunity(acting, { pipelineId: pipeline.id, stageId: newStage.id, name: "Before opt-in" });
    const clientBefore = await attemptGatedConversion(acting.organisationId, dealBefore.id);
    expect(await getClientOnboarding(acting, clientBefore!.id)).toBeNull();

    // Opt in and configure a default template.
    await updateOrganisationSettings(acting, { autoStartOnboarding: true });
    await createOnboardingTemplate(acting, {
      name: "Default template",
      isDefault: true,
      steps: [{ label: "Step", stepType: "WELCOME", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false }],
    });

    const dealAfter = await createOpportunity(acting, { pipelineId: pipeline.id, stageId: newStage.id, name: "After opt-in" });
    const clientAfter = await attemptGatedConversion(acting.organisationId, dealAfter.id);
    const onboardingAfter = await getClientOnboarding(acting, clientAfter!.id);
    expect(onboardingAfter).not.toBeNull();
    expect(onboardingAfter!.status).toBe("IN_PROGRESS");
  });

  it("auto-completes a PROPOSAL_ACCEPTANCE step once the linked opportunity's proposal is accepted — never a manual action", async () => {
    const acting = await freshOrgOwner("Derived");
    const pipeline = await ensureDefaultPipeline(acting);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const deal = await createOpportunity(acting, { pipelineId: pipeline.id, stageId: newStage.id, name: "Derived deal" });
    const client = await attemptGatedConversion(acting.organisationId, deal.id);

    const template = await createOnboardingTemplate(acting, {
      name: "Derived template",
      isDefault: false,
      steps: [
        {
          label: "Accept proposal",
          stepType: "PROPOSAL_ACCEPTANCE",
          assignedTo: "CLIENT",
          isMandatory: true,
          requiresApproval: false,
        },
      ],
    });
    const onboarding = await startOnboarding(acting, client!.id, template.id);
    const step = onboarding.steps[0];
    expect(step.status).toBe("PENDING");

    // Manual completion is explicitly rejected for a derived step type.
    await expect(
      completeOnboardingStep({ portalSession: { portalUserId: "x", clientId: client!.id, organisationId: acting.organisationId } }, step.id)
    ).rejects.toThrow(/completes automatically/);

    await prisma.proposal.create({
      data: {
        organisationId: acting.organisationId,
        opportunityId: deal.id,
        title: "Derived proposal",
        status: "ACCEPTED",
      },
    });

    const synced = await getClientOnboarding(acting, client!.id);
    const syncedStep = synced!.steps.find((s) => s.id === step.id)!;
    expect(syncedStep.status).toBe("COMPLETED");
    expect(synced!.status).toBe("COMPLETED");
  });
});
