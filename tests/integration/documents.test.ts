import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// No real S3 credentials exist in this environment — mocked the same
// way tests/integration/payments-gating.test.ts mocks stripe-provider,
// so the service logic (authorization, scoping, metadata) is exercised
// faithfully without a live bucket.
vi.mock("@/lib/storage", () => ({
  buildDocumentStorageKey: (organisationId: string, clientId: string, filename: string) =>
    `org/${organisationId}/clients/${clientId}/documents/${randomUUID()}-${filename}`,
  createUploadUrl: vi.fn(async (key: string) => `https://storage.test.invalid/upload/${key}`),
  createDownloadUrl: vi.fn(async (key: string) => `https://storage.test.invalid/download/${key}`),
  deleteObject: vi.fn(async () => {}),
  objectExists: vi.fn(async () => true),
}));

import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { attemptGatedConversion } from "@/modules/sales/conversion";
import { createOpportunity, ensureDefaultPipeline } from "@/modules/sales/service";
import {
  confirmDocumentUpload,
  getDocumentDownloadUrl,
  listClientDocuments,
  requestDocumentUpload,
  reviewDocument,
} from "@/modules/documents/service";
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
  const deal = await createOpportunity(acting, { pipelineId: pipeline.id, stageId: newStage.id, name });
  return (await attemptGatedConversion(acting.organisationId, deal.id))!;
}

/** A real ClientPortalUser row (bypassing the invite/cookie flow, which
 * this file isn't testing — see client-portal-onboarding.test.ts for
 * that) so FK-constrained writes (ClientDocument.uploadedByPortalUserId)
 * have a real row to point at. */
async function freshPortalUser(organisationId: string, clientId: string) {
  const portalUser = await prisma.clientPortalUser.create({
    data: {
      organisationId,
      clientId,
      email: uniqueEmail("portal-doc-test"),
      status: "ACTIVE",
    },
  });
  return { portalUserId: portalUser.id, clientId, organisationId };
}

afterAll(async () => {
  await prisma.clientDocument.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.clientPortalUser.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.client.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("document upload, review, and isolation", () => {
  it("lets a client request+confirm an upload, and an internal reviewer approve it", async () => {
    const acting = await freshOrgOwner("Docs");
    const client = await freshWonClient(acting, `Docs Client ${randomUUID()}`);
    const portalSession = await freshPortalUser(acting.organisationId, client.id);

    const { document, uploadUrl } = await requestDocumentUpload({ portalSession }, client.id, {
      originalFilename: "passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(uploadUrl).toContain(document.storageKey);
    expect(document.status).toBe("PENDING_REVIEW");

    await confirmDocumentUpload({ portalSession }, document.id);

    const reviewed = await reviewDocument(acting, document.id, "APPROVE");
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.reviewedByMembershipId).toBe(acting.membershipId);
  });

  it("isolates documents between two different clients' portal sessions", async () => {
    const acting = await freshOrgOwner("DocsIso");
    const clientA = await freshWonClient(acting, `DocsIso A ${randomUUID()}`);
    const clientB = await freshWonClient(acting, `DocsIso B ${randomUUID()}`);
    const sessionA = await freshPortalUser(acting.organisationId, clientA.id);
    const sessionB = await freshPortalUser(acting.organisationId, clientB.id);

    const { document } = await requestDocumentUpload({ portalSession: sessionA }, clientA.id, {
      originalFilename: "a-doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });

    // B cannot even request an upload scoped to A's client...
    await expect(
      requestDocumentUpload({ portalSession: sessionB }, clientA.id, {
        originalFilename: "sneaky.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      })
    ).rejects.toThrow(/not found/i);

    // ...nor list, confirm, or download A's document.
    await expect(listClientDocuments({ portalSession: sessionB }, clientA.id)).rejects.toThrow(/not found/i);
    await expect(confirmDocumentUpload({ portalSession: sessionB }, document.id)).rejects.toThrow(/not found/i);
    await expect(getDocumentDownloadUrl({ portalSession: sessionB }, document.id)).rejects.toThrow(/not found/i);
  });

  it("rejects reviewing a document from a different organisation", async () => {
    const actingOrgA = await freshOrgOwner("DocsOrgA");
    const actingOrgB = await freshOrgOwner("DocsOrgB");
    const clientA = await freshWonClient(actingOrgA, `DocsOrgA Client ${randomUUID()}`);
    const sessionA = await freshPortalUser(actingOrgA.organisationId, clientA.id);

    const { document } = await requestDocumentUpload({ portalSession: sessionA }, clientA.id, {
      originalFilename: "cross-org.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });

    await expect(reviewDocument(actingOrgB, document.id, "APPROVE")).rejects.toThrow(/not found/i);
  });

  it("rejects an internal actor without PORTAL_MANAGE from reviewing a document", async () => {
    const acting = await freshOrgOwner("DocsPerm");
    const client = await freshWonClient(acting, `DocsPerm Client ${randomUUID()}`);
    const sessionClient = await freshPortalUser(acting.organisationId, client.id);
    const { document } = await requestDocumentUpload({ portalSession: sessionClient }, client.id, {
      originalFilename: "perm.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });

    const actingContractor: ActiveMembership = { ...acting, role: "CONTRACTOR" };
    await expect(reviewDocument(actingContractor, document.id, "APPROVE")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
