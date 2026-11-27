import crypto from "crypto";
import { ProposalStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateProposalInput,
  CreateProposalVersionInput,
  ListProposalsQuery,
  UpdateProposalStatusInput,
} from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

export async function listProposals(acting: ActiveMembership, query: ListProposalsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ProposalWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.proposal.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { lines: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.proposal.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getProposal(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const proposal = await prisma.proposal.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      company: true,
      contact: true,
      opportunity: true,
      versions: { orderBy: { versionNumber: "desc" }, include: { lines: { orderBy: { position: "asc" } } } },
    },
  });
  if (!proposal) throw new NotFoundError("Proposal not found.");
  return proposal;
}

export async function createProposal(acting: ActiveMembership, input: CreateProposalInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

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

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        organisationId: acting.organisationId,
        title: input.title,
        opportunityId: input.opportunityId,
        companyId: input.companyId,
        contactId: input.contactId,
        currency: input.currency ?? "GBP",
        expiresAt: input.expiresAt,
        ownerId: acting.userId
          ? (
              await tx.membership.findFirst({
                where: { userId: acting.userId, organisationId: acting.organisationId },
                select: { id: true },
              })
            )?.id
          : undefined,
      },
    });
    await tx.proposalVersion.create({
      data: {
        proposalId: created.id,
        versionNumber: 1,
        lines: {
          create: (input.lines ?? []).map((line, index) => ({
            serviceItemId: line.serviceItemId,
            description: line.description,
            quantity: line.quantity ?? 1,
            unitPriceMinor: line.unitPriceMinor,
            position: index,
          })),
        },
      },
    });
    return created;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "proposal.created",
    resourceType: "Proposal",
    resourceId: proposal.id,
  });

  return proposal;
}

/** A new version is how a proposal is edited after it exists — the
 * previous version's lines are never mutated, matching the "versioned
 * document" requirement. */
export async function createProposalVersion(
  acting: ActiveMembership,
  proposalId: string,
  input: CreateProposalVersionInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, organisationId: acting.organisationId } });
  if (!proposal) throw new NotFoundError("Proposal not found.");

  const latest = await prisma.proposalVersion.findFirst({
    where: { proposalId },
    orderBy: { versionNumber: "desc" },
  });

  const version = await prisma.proposalVersion.create({
    data: {
      proposalId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      lines: {
        create: input.lines.map((line, index) => ({
          serviceItemId: line.serviceItemId,
          description: line.description,
          quantity: line.quantity ?? 1,
          unitPriceMinor: line.unitPriceMinor,
          position: index,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "proposal.version_created",
    resourceType: "Proposal",
    resourceId: proposalId,
    metadata: { versionNumber: version.versionNumber },
  });

  return version;
}

/** Generates (or returns the existing) opaque public-link token for secure,
 * unauthenticated client viewing — never the record's own id. */
export async function ensurePublicLink(acting: ActiveMembership, proposalId: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, organisationId: acting.organisationId } });
  if (!proposal) throw new NotFoundError("Proposal not found.");
  if (proposal.publicToken) return proposal;

  return prisma.proposal.update({
    where: { id: proposalId },
    data: { publicToken: crypto.randomBytes(24).toString("hex") },
  });
}

export async function updateProposalStatus(
  acting: ActiveMembership,
  proposalId: string,
  input: UpdateProposalStatusInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, organisationId: acting.organisationId } });
  if (!proposal) throw new NotFoundError("Proposal not found.");

  const timestampField =
    input.status === ProposalStatus.SENT
      ? { sentAt: new Date() }
      : input.status === ProposalStatus.ACCEPTED || input.status === ProposalStatus.DECLINED
        ? { respondedAt: new Date() }
        : {};

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: input.status, ...timestampField },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "proposal.status_changed",
    resourceType: "Proposal",
    resourceId: proposalId,
    metadata: { toStatus: input.status },
  });

  return updated;
}

// --- Public (unauthenticated) access via the secure link token ---
// No ActiveMembership here by design — this is the client-facing view.
// Still strictly scoped: only a proposal with a matching, non-expired
// publicToken is ever returned, never resolved by raw id.

export async function getProposalByPublicToken(token: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { publicToken: token, deletedAt: null },
    include: {
      organisation: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { lines: { orderBy: { position: "asc" } } } },
    },
  });
  if (!proposal) throw new NotFoundError("This proposal link is invalid or has expired.");
  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    throw new NotFoundError("This proposal link has expired.");
  }

  if (!proposal.viewedAt) {
    const newStatus = proposal.status === ProposalStatus.SENT ? ProposalStatus.VIEWED : proposal.status;
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { viewedAt: new Date(), status: newStatus },
    });
    await writeAuditLog({
      organisationId: proposal.organisationId,
      actorUserId: null,
      action: "proposal.viewed",
      resourceType: "Proposal",
      resourceId: proposal.id,
    });
    // Return the post-update state — the caller must see the status flip
    // to VIEWED on the very first open, not a stale pre-update snapshot.
    return { ...proposal, viewedAt: new Date(), status: newStatus };
  }

  return proposal;
}

/** The client's own accept/decline action on the public link — not an
 * e-signature (no vendor is integrated; see docs/DECISION_LOG.md), just a
 * recorded response. */
export async function respondToPublicProposal(token: string, response: "ACCEPTED" | "DECLINED") {
  const proposal = await prisma.proposal.findFirst({ where: { publicToken: token, deletedAt: null } });
  if (!proposal) throw new NotFoundError("This proposal link is invalid or has expired.");
  if (proposal.status === ProposalStatus.ACCEPTED || proposal.status === ProposalStatus.DECLINED) {
    throw new Error("This proposal has already been responded to.");
  }

  const updated = await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: response, respondedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: proposal.organisationId,
    actorUserId: null,
    action: response === "ACCEPTED" ? "proposal.accepted" : "proposal.declined",
    resourceType: "Proposal",
    resourceId: proposal.id,
  });

  return updated;
}
