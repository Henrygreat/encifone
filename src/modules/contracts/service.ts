import crypto from "crypto";
import { ContractStatus, ContractTemplateStatus, Prisma, SignatureRequestStatus, WebhookProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { getESignatureProvider, InvalidWebhookSignatureError } from "./esignature-provider";
import type {
  CreateContractInput,
  CreateContractTemplateInput,
  CreateContractVersionInput,
  CreateSignatureRequestInput,
  ListContractsQuery,
  ListContractTemplatesQuery,
  UpdateContractStatusInput,
  UpdateContractTemplateInput,
} from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

// --- Contract templates ---

export async function listContractTemplates(acting: ActiveMembership, query: ListContractTemplatesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ContractTemplateWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contractTemplate.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.contractTemplate.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function createContractTemplate(acting: ActiveMembership, input: CreateContractTemplateInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const template = await prisma.contractTemplate.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      description: input.description,
      bodyMarkdown: input.bodyMarkdown,
      status: input.status ?? ContractTemplateStatus.ACTIVE,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract_template.created",
    resourceType: "ContractTemplate",
    resourceId: template.id,
  });

  return template;
}

export async function updateContractTemplate(
  acting: ActiveMembership,
  id: string,
  input: UpdateContractTemplateInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.contractTemplate.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Contract template not found.");

  const template = await prisma.contractTemplate.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract_template.updated",
    resourceType: "ContractTemplate",
    resourceId: template.id,
    metadata: { fields: Object.keys(input) },
  });

  return template;
}

export async function archiveContractTemplate(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.contractTemplate.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Contract template not found.");

  const template = await prisma.contractTemplate.update({
    where: { id },
    data: { status: ContractTemplateStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract_template.archived",
    resourceType: "ContractTemplate",
    resourceId: template.id,
  });

  return template;
}

// --- Contracts ---

export async function listContracts(acting: ActiveMembership, query: ListContractsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ContractWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        signatureRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.contract.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getContract(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const contract = await prisma.contract.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      company: true,
      contact: true,
      opportunity: true,
      template: true,
      versions: { orderBy: { versionNumber: "desc" } },
      signatureRequests: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!contract) throw new NotFoundError("Contract not found.");
  return contract;
}

export async function createContract(acting: ActiveMembership, input: CreateContractInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  let content = input.content;
  if (input.templateId) {
    const template = await prisma.contractTemplate.findFirst({
      where: { id: input.templateId, organisationId: acting.organisationId, deletedAt: null },
    });
    if (!template) throw new NotFoundError("The selected contract template was not found in this organisation.");
    content = content ?? template.bodyMarkdown;
  }
  if (!content) {
    throw new Error("Provide contract content directly, or a templateId to source it from.");
  }

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!opportunity) throw new NotFoundError("The selected opportunity was not found in this organisation.");
  }
  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError("The selected contact was not found in this organisation.");
  }

  const contract = await prisma.$transaction(async (tx) => {
    const ownerMembership = await tx.membership.findFirst({
      where: { userId: acting.userId, organisationId: acting.organisationId },
      select: { id: true },
    });
    const created = await tx.contract.create({
      data: {
        organisationId: acting.organisationId,
        templateId: input.templateId,
        opportunityId: input.opportunityId,
        companyId: input.companyId,
        contactId: input.contactId,
        title: input.title,
        expiresAt: input.expiresAt,
        ownerId: ownerMembership?.id,
      },
    });
    await tx.contractVersion.create({
      data: { contractId: created.id, versionNumber: 1, content: content! },
    });
    return created;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract.created",
    resourceType: "Contract",
    resourceId: contract.id,
  });

  return contract;
}

export async function createContractVersion(
  acting: ActiveMembership,
  contractId: string,
  input: CreateContractVersionInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const contract = await prisma.contract.findFirst({ where: { id: contractId, organisationId: acting.organisationId } });
  if (!contract) throw new NotFoundError("Contract not found.");

  const latest = await prisma.contractVersion.findFirst({ where: { contractId }, orderBy: { versionNumber: "desc" } });

  const version = await prisma.contractVersion.create({
    data: { contractId, versionNumber: (latest?.versionNumber ?? 0) + 1, content: input.content },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract.version_created",
    resourceType: "Contract",
    resourceId: contractId,
    metadata: { versionNumber: version.versionNumber },
  });

  return version;
}

export async function updateContractStatus(acting: ActiveMembership, contractId: string, input: UpdateContractStatusInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const contract = await prisma.contract.findFirst({ where: { id: contractId, organisationId: acting.organisationId } });
  if (!contract) throw new NotFoundError("Contract not found.");

  const updated = await prisma.contract.update({ where: { id: contractId }, data: { status: input.status } });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract.status_changed",
    resourceType: "Contract",
    resourceId: contractId,
    metadata: { toStatus: input.status },
  });

  return updated;
}

/**
 * Generates (or returns the existing) public-link token and sends the
 * contract for signature: creates a SignatureRequest via the configured
 * ESignatureProvider (today: MockESignatureProvider — no real network
 * call), moves the contract to SENT. Re-sending (contract already SENT)
 * creates a fresh SignatureRequest rather than reusing a stale one.
 */
export async function sendContractForSignature(
  acting: ActiveMembership,
  contractId: string,
  input: CreateSignatureRequestInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const contract = await prisma.contract.findFirst({ where: { id: contractId, organisationId: acting.organisationId } });
  if (!contract) throw new NotFoundError("Contract not found.");
  if (contract.status === ContractStatus.SIGNED || contract.status === ContractStatus.VOIDED) {
    throw new Error(`Cannot send a contract that is already ${contract.status.toLowerCase()}.`);
  }

  const provider = getESignatureProvider();
  const { providerRequestId } = provider.createSignatureRequest();

  const result = await prisma.$transaction(async (tx) => {
    const signatureRequest = await tx.signatureRequest.create({
      data: {
        contractId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        provider: provider.type,
        providerRequestId,
      },
    });
    const updatedContract = await tx.contract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.SENT,
        sentAt: new Date(),
        publicToken: contract.publicToken ?? crypto.randomBytes(24).toString("hex"),
      },
    });
    return { signatureRequest, contract: updatedContract };
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contract.sent_for_signature",
    resourceType: "Contract",
    resourceId: contractId,
    metadata: { signerEmail: input.signerEmail, signatureRequestId: result.signatureRequest.id },
  });

  return result;
}

// --- Public (unauthenticated) access via the secure link token ---
// Mirrors src/modules/proposals/service.ts's public functions exactly —
// no ActiveMembership, strictly scoped by publicToken, never a bare id.

export async function getContractByPublicToken(token: string) {
  const contract = await prisma.contract.findFirst({
    where: { publicToken: token, deletedAt: null },
    include: {
      organisation: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      signatureRequests: { where: { status: SignatureRequestStatus.PENDING }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!contract) throw new NotFoundError("This contract link is invalid or has expired.");
  if (contract.expiresAt && contract.expiresAt < new Date()) {
    throw new NotFoundError("This contract link has expired.");
  }

  if (!contract.viewedAt) {
    const newStatus = contract.status === ContractStatus.SENT ? ContractStatus.VIEWED : contract.status;
    await prisma.contract.update({ where: { id: contract.id }, data: { viewedAt: new Date(), status: newStatus } });
    await writeAuditLog({
      organisationId: contract.organisationId,
      actorUserId: null,
      action: "contract.viewed",
      resourceType: "Contract",
      resourceId: contract.id,
    });
    return { ...contract, viewedAt: new Date(), status: newStatus };
  }

  return contract;
}

async function applySignatureOutcome(
  contractId: string,
  signatureRequestId: string,
  outcome: "signed" | "declined",
  signedName: string | undefined,
  signedIpAddress: string | undefined
) {
  const contract = await prisma.$transaction(async (tx) => {
    await tx.signatureRequest.update({
      where: { id: signatureRequestId },
      data:
        outcome === "signed"
          ? { status: SignatureRequestStatus.SIGNED, signedAt: new Date(), signedName, signedIpAddress }
          : { status: SignatureRequestStatus.DECLINED, declinedAt: new Date() },
    });
    return tx.contract.update({
      where: { id: contractId },
      data:
        outcome === "signed"
          ? { status: ContractStatus.SIGNED, signedAt: new Date() }
          : { status: ContractStatus.DECLINED, declinedAt: new Date() },
    });
  });

  await writeAuditLog({
    organisationId: contract.organisationId,
    actorUserId: null,
    action: outcome === "signed" ? "contract.signed" : "contract.declined",
    resourceType: "Contract",
    resourceId: contractId,
    metadata: { signatureRequestId },
  });

  return contract;
}

export async function signContractPublicly(token: string, signerName: string, signerIpAddress: string | undefined) {
  const contract = await prisma.contract.findFirst({
    where: { publicToken: token, deletedAt: null },
    include: { signatureRequests: { where: { status: SignatureRequestStatus.PENDING }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!contract) throw new NotFoundError("This contract link is invalid or has expired.");
  if (contract.status === ContractStatus.SIGNED || contract.status === ContractStatus.DECLINED) {
    throw new Error("This contract has already been responded to.");
  }
  const pending = contract.signatureRequests[0];
  if (!pending) {
    throw new Error("This contract has no pending signature request.");
  }

  return applySignatureOutcome(contract.id, pending.id, "signed", signerName, signerIpAddress);
}

export async function declineContractPublicly(token: string) {
  const contract = await prisma.contract.findFirst({
    where: { publicToken: token, deletedAt: null },
    include: { signatureRequests: { where: { status: SignatureRequestStatus.PENDING }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!contract) throw new NotFoundError("This contract link is invalid or has expired.");
  if (contract.status === ContractStatus.SIGNED || contract.status === ContractStatus.DECLINED) {
    throw new Error("This contract has already been responded to.");
  }
  const pending = contract.signatureRequests[0];
  if (!pending) {
    throw new Error("This contract has no pending signature request.");
  }

  return applySignatureOutcome(contract.id, pending.id, "declined", undefined, undefined);
}

/**
 * The webhook surface: verifies the mock provider's HMAC signature, dedupes
 * via IncomingWebhookEvent (a retried/redelivered event with the same id is
 * a no-op on its second+ delivery), resolves the SignatureRequest by
 * providerRequestId, and applies the same outcome the public sign/decline
 * flow applies. Throws InvalidWebhookSignatureError on a bad signature —
 * the caller maps that to a 400, never processing an unverified payload.
 */
export async function processESignatureWebhook(rawBody: string, signatureHeader: string | null) {
  const provider = getESignatureProvider();
  const event = provider.verifyAndParseWebhook(rawBody, signatureHeader);

  const alreadyProcessed = await prisma.incomingWebhookEvent.findUnique({
    where: { provider_externalEventId: { provider: WebhookProvider.ESIGNATURE_MOCK, externalEventId: event.externalEventId } },
  });
  if (alreadyProcessed) {
    return { deduped: true as const };
  }

  const signatureRequest = await prisma.signatureRequest.findUnique({
    where: { providerRequestId: event.providerRequestId },
  });
  if (!signatureRequest) {
    throw new NotFoundError("No signature request matches this webhook's providerRequestId.");
  }

  await prisma.incomingWebhookEvent.create({
    data: { provider: WebhookProvider.ESIGNATURE_MOCK, externalEventId: event.externalEventId, payload: JSON.parse(rawBody) },
  });

  if (signatureRequest.status !== SignatureRequestStatus.PENDING) {
    // Already resolved (e.g. via the direct public-sign path) — the
    // webhook is still deduped/recorded above, but there's nothing left
    // to apply.
    return { deduped: false as const, alreadyResolved: true as const };
  }

  const contract = await applySignatureOutcome(
    signatureRequest.contractId,
    signatureRequest.id,
    event.type,
    event.signedName,
    event.signedIpAddress
  );

  await writeAuditLog({
    organisationId: contract.organisationId,
    actorUserId: null,
    action: "contract.webhook_received",
    resourceType: "Contract",
    resourceId: contract.id,
    metadata: { externalEventId: event.externalEventId, type: event.type },
  });

  return { deduped: false as const, alreadyResolved: false as const, contract };
}

export { InvalidWebhookSignatureError };

/** Used by src/modules/clients/service.ts's gated-conversion check (Phase
 * 2.7) — never duplicated as a separate query there. */
export async function hasSignedContractForOpportunity(organisationId: string, opportunityId: string): Promise<boolean> {
  const count = await prisma.contract.count({
    where: { organisationId, opportunityId, status: ContractStatus.SIGNED, deletedAt: null },
  });
  return count > 0;
}
