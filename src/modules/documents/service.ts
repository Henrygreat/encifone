import { DocumentStatus, DocumentUploadedByType, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import type { ActivePortalSession } from "@/modules/portal/auth";
import { NotFoundError } from "@/lib/api";
import { buildDocumentStorageKey, createDownloadUrl, createUploadUrl, deleteObject, objectExists } from "@/lib/storage";
import { notifyMembership, notifyPortalUser } from "@/modules/notifications/service";
import type { RequestUploadInput } from "./schemas";

type Actor = { portalSession: ActivePortalSession } | { acting: ActiveMembership };

function actorScope(actor: Actor): { organisationId: string; clientId?: string } {
  return "portalSession" in actor
    ? { organisationId: actor.portalSession.organisationId, clientId: actor.portalSession.clientId }
    : { organisationId: actor.acting.organisationId };
}

/**
 * Two-phase upload: this creates the metadata row and a short-lived
 * signed PUT URL — the file bytes go straight from the caller's browser
 * to the bucket, the app server never buffers them. confirmUpload then
 * verifies the object actually landed before trusting the row.
 */
export async function requestDocumentUpload(actor: Actor, clientId: string, input: RequestUploadInput) {
  const scope = actorScope(actor);
  if (scope.clientId && scope.clientId !== clientId) {
    throw new NotFoundError("Client not found.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, organisationId: scope.organisationId, deletedAt: null },
  });
  if (!client) throw new NotFoundError("Client not found.");

  if (!scope.clientId) {
    // Internal actor — require PORTAL_VIEW at minimum (uploading on a
    // client's behalf is a normal part of managing their onboarding).
    if (!roleHasCapability((actor as { acting: ActiveMembership }).acting.role, Capability.PORTAL_VIEW)) {
      throw new ForbiddenError("You do not have permission to upload documents for this client.");
    }
  }

  if (input.onboardingStepId) {
    const step = await prisma.clientOnboardingStep.findFirst({
      where: { id: input.onboardingStepId, onboarding: { clientId } },
    });
    if (!step) throw new NotFoundError("Onboarding step not found.");
  }

  const storageKey = buildDocumentStorageKey(client.organisationId, clientId, input.originalFilename);
  const uploadedByType = scope.clientId ? DocumentUploadedByType.CLIENT : DocumentUploadedByType.INTERNAL;

  const document = await prisma.clientDocument.create({
    data: {
      organisationId: client.organisationId,
      clientId,
      onboardingStepId: input.onboardingStepId,
      uploadedByType,
      uploadedByPortalUserId: "portalSession" in actor ? actor.portalSession.portalUserId : null,
      uploadedByMembershipId: "acting" in actor ? actor.acting.membershipId : null,
      category: input.category,
      originalFilename: input.originalFilename,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: DocumentStatus.PENDING_REVIEW,
    },
  });

  const uploadUrl = await createUploadUrl(storageKey, input.mimeType);
  return { document, uploadUrl };
}

/** Verifies the object actually exists in the bucket with the expected
 * size before treating the upload as real — never trusts the client's
 * bare "I'm done" signal alone. */
export async function confirmDocumentUpload(actor: Actor, documentId: string) {
  const scope = actorScope(actor);
  const document = await prisma.clientDocument.findFirst({
    where: { id: documentId, organisationId: scope.organisationId, ...(scope.clientId ? { clientId: scope.clientId } : {}) },
  });
  if (!document) throw new NotFoundError("Document not found.");

  const exists = await objectExists(document.storageKey, document.sizeBytes);
  if (!exists) {
    throw new Error("The file was not found in storage — the upload may not have completed. Please try again.");
  }

  if (document.onboardingStepId) {
    const step = await prisma.clientOnboardingStep.findUnique({
      where: { id: document.onboardingStepId },
      include: { onboarding: { include: { client: true } } },
    });
    if (step?.assignedTo === "INTERNAL" && step.onboarding.client.ownerId) {
      await notifyMembership({
        organisationId: step.onboarding.client.organisationId,
        membershipId: step.onboarding.client.ownerId,
        type: NotificationType.DOCUMENT_UPLOADED,
        title: `A new document was uploaded for ${step.onboarding.client.name}`,
        href: `/clients/${document.clientId}`,
      });
    }
  }

  return document;
}

export async function listClientDocuments(actor: Actor, clientId: string) {
  const scope = actorScope(actor);
  if (scope.clientId && scope.clientId !== clientId) {
    throw new NotFoundError("Client not found.");
  }
  if (!scope.clientId && !roleHasCapability((actor as { acting: ActiveMembership }).acting.role, Capability.PORTAL_VIEW)) {
    throw new ForbiddenError("You do not have permission to view documents for this client.");
  }

  return prisma.clientDocument.findMany({
    where: { clientId, organisationId: scope.organisationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** Mints a fresh, short-lived signed download URL after re-checking the
 * caller's own scope — never a cached or reused URL, never served from
 * a public bucket URL (CLAUDE.md §11). */
export async function getDocumentDownloadUrl(actor: Actor, documentId: string) {
  const scope = actorScope(actor);
  const document = await prisma.clientDocument.findFirst({
    where: {
      id: documentId,
      organisationId: scope.organisationId,
      deletedAt: null,
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
    },
  });
  if (!document) throw new NotFoundError("Document not found.");
  if (!scope.clientId && !roleHasCapability((actor as { acting: ActiveMembership }).acting.role, Capability.PORTAL_VIEW)) {
    throw new ForbiddenError("You do not have permission to view this document.");
  }

  return createDownloadUrl(document.storageKey, document.originalFilename);
}

export async function reviewDocument(acting: ActiveMembership, documentId: string, decision: "APPROVE" | "REJECT") {
  if (!roleHasCapability(acting.role, Capability.PORTAL_MANAGE)) {
    throw new ForbiddenError("You do not have permission to review documents.");
  }

  const document = await prisma.clientDocument.findFirst({
    where: { id: documentId, organisationId: acting.organisationId, deletedAt: null },
    include: { client: true },
  });
  if (!document) throw new NotFoundError("Document not found.");

  const updated = await prisma.clientDocument.update({
    where: { id: documentId },
    data: {
      status: decision === "APPROVE" ? DocumentStatus.APPROVED : DocumentStatus.REJECTED,
      reviewedByMembershipId: acting.membershipId,
      reviewedAt: new Date(),
    },
  });

  if (document.uploadedByPortalUserId) {
    await notifyPortalUser({
      organisationId: acting.organisationId,
      portalUserId: document.uploadedByPortalUserId,
      type: NotificationType.DOCUMENT_REVIEWED,
      title:
        decision === "APPROVE"
          ? `"${document.originalFilename}" was approved`
          : `"${document.originalFilename}" needs to be re-uploaded`,
    });
  }

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: decision === "APPROVE" ? "document.approved" : "document.rejected",
    resourceType: "ClientDocument",
    resourceId: documentId,
  });

  return updated;
}

/** Soft-deletes the metadata row and removes the object from storage —
 * internal-only (an uploaded document is evidence; a client can
 * re-upload a replacement but never erase their own submission history). */
export async function deleteClientDocument(acting: ActiveMembership, documentId: string) {
  if (!roleHasCapability(acting.role, Capability.PORTAL_MANAGE)) {
    throw new ForbiddenError("You do not have permission to delete documents.");
  }
  const document = await prisma.clientDocument.findFirst({
    where: { id: documentId, organisationId: acting.organisationId, deletedAt: null },
  });
  if (!document) throw new NotFoundError("Document not found.");

  await prisma.clientDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
  await deleteObject(document.storageKey).catch((error) => {
    console.error("Failed to delete object from storage (metadata row already marked deleted):", error);
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "document.deleted",
    resourceType: "ClientDocument",
    resourceId: documentId,
  });
}
