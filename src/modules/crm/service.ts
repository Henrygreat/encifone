import { CompanyStatus, ContactStatus, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { calculateLeadScore } from "@/modules/intelligence/lead-scoring";
import type {
  ConvertLeadInput,
  CreateCompanyInput,
  CreateContactInput,
  CreateLeadInput,
  ListCompaniesQuery,
  ListContactsQuery,
  ListLeadsQuery,
  UpdateCompanyInput,
  UpdateContactInput,
  UpdateLeadInput,
} from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

/**
 * Verifies a Membership id (used as `ownerId`) actually belongs to the
 * acting user's organisation before it's allowed onto a record — never
 * trust a client-supplied id as proof it's valid for this tenant.
 */
async function assertMembershipInOrg(organisationId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organisationId },
    select: { id: true },
  });
  if (!membership) {
    throw new NotFoundError("The selected owner was not found in this organisation.");
  }
}

// --- Contacts ---

export async function listContacts(acting: ActiveMembership, query: ListContactsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ContactWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: query.status === ContactStatus.ARCHIVED ? { not: null } : null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { jobTitle: { contains: query.search, mode: "insensitive" } },
            { company: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, owner: { include: { user: true } } },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getContact(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const contact = await prisma.contact.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: { company: true, owner: { include: { user: true } } },
  });
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}

export async function createContact(acting: ActiveMembership, input: CreateContactInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const contact = await prisma.contact.create({
    data: {
      organisationId: acting.organisationId,
      firstName: input.firstName,
      lastName: input.lastName,
      jobTitle: input.jobTitle,
      department: input.department,
      emails: input.emails ?? [],
      phones: input.phones ?? [],
      preferredChannel: input.preferredChannel,
      companyId: input.companyId,
      ownerId: input.ownerId,
      status: input.status ?? ContactStatus.ACTIVE,
      leadSource: input.leadSource,
      marketingConsent: input.marketingConsent ?? false,
      tags: input.tags ?? [],
      notes: input.notes,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.created",
    resourceType: "Contact",
    resourceId: contact.id,
  });

  return contact;
}

export async function updateContact(acting: ActiveMembership, id: string, input: UpdateContactInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.contact.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Contact not found.");

  if (input.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.companyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("The selected company was not found in this organisation.");
  }
  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      ...input,
      emails: input.emails !== undefined ? input.emails : undefined,
      phones: input.phones !== undefined ? input.phones : undefined,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.updated",
    resourceType: "Contact",
    resourceId: contact.id,
    metadata: { fields: Object.keys(input) },
  });

  return contact;
}

/** Soft delete only — `deletedAt` + status ARCHIVED. Never a hard delete; see CRM_DELETE's doc comment in src/core/permissions.ts for why that's a separate, not-yet-built capability. */
export async function archiveContact(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.contact.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Contact not found.");

  const contact = await prisma.contact.update({
    where: { id },
    data: { status: ContactStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.archived",
    resourceType: "Contact",
    resourceId: contact.id,
  });

  return contact;
}

// --- Companies ---

export async function listCompanies(acting: ActiveMembership, query: ListCompaniesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.CompanyWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: query.status === CompanyStatus.ARCHIVED ? { not: null } : null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { tradingName: { contains: query.search, mode: "insensitive" } },
            { industry: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: {
        owner: { include: { user: true } },
        _count: { select: { contacts: true, opportunities: true } },
      },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getCompany(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const company = await prisma.company.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      owner: { include: { user: true } },
      contacts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 25 },
      opportunities: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!company) throw new NotFoundError("Company not found.");
  return company;
}

export async function createCompany(acting: ActiveMembership, input: CreateCompanyInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }
  if (input.parentCompanyId) {
    const parent = await prisma.company.findFirst({
      where: { id: input.parentCompanyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!parent) throw new NotFoundError("The selected parent company was not found in this organisation.");
  }

  const company = await prisma.company.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      tradingName: input.tradingName,
      registrationNumber: input.registrationNumber,
      industry: input.industry,
      companySize: input.companySize,
      website: input.website,
      email: input.email,
      phone: input.phone,
      country: input.country,
      currency: input.currency ?? "GBP",
      ownerId: input.ownerId,
      status: input.status ?? CompanyStatus.ACTIVE,
      parentCompanyId: input.parentCompanyId,
      tags: input.tags ?? [],
      notes: input.notes,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "company.created",
    resourceType: "Company",
    resourceId: company.id,
  });

  return company;
}

export async function updateCompany(acting: ActiveMembership, id: string, input: UpdateCompanyInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.company.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company not found.");

  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }
  if (input.parentCompanyId) {
    if (input.parentCompanyId === id) {
      throw new Error("A company cannot be its own parent.");
    }
    const parent = await prisma.company.findFirst({
      where: { id: input.parentCompanyId, organisationId: acting.organisationId },
      select: { id: true },
    });
    if (!parent) throw new NotFoundError("The selected parent company was not found in this organisation.");
  }

  const company = await prisma.company.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "company.updated",
    resourceType: "Company",
    resourceId: company.id,
    metadata: { fields: Object.keys(input) },
  });

  return company;
}

export async function archiveCompany(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.company.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company not found.");

  const company = await prisma.company.update({
    where: { id },
    data: { status: CompanyStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "company.archived",
    resourceType: "Company",
    resourceId: company.id,
  });

  return company;
}

// --- Leads ---

export async function listLeads(acting: ActiveMembership, query: ListLeadsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.LeadWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: query.status === LeadStatus.ARCHIVED ? { not: null } : null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { companyName: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { owner: { include: { user: true } }, company: { select: { id: true, name: true } } },
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getLead(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const lead = await prisma.lead.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      owner: { include: { user: true } },
      company: true,
      contact: true,
      ownershipHistory: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!lead) throw new NotFoundError("Lead not found.");
  return lead;
}

export async function createLead(acting: ActiveMembership, input: CreateLeadInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const now = new Date();
  const priority = input.priority ?? "MEDIUM";
  // Deterministic, explainable — see src/modules/intelligence/lead-scoring.ts.
  const { score } = calculateLeadScore({
    email: input.email ?? null,
    phone: input.phone ?? null,
    companyName: input.companyName ?? null,
    source: input.source ?? null,
    priority,
    estimatedValueMinor: input.estimatedValueMinor ?? null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
    createdAt: now,
  });

  const lead = await prisma.lead.create({
    data: {
      organisationId: acting.organisationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      companyName: input.companyName,
      source: input.source,
      status: input.status ?? LeadStatus.NEW,
      priority,
      estimatedValueMinor: input.estimatedValueMinor,
      currency: input.currency ?? "GBP",
      ownerId: input.ownerId,
      nextFollowUpAt: input.nextFollowUpAt,
      tags: input.tags ?? [],
      notes: input.notes,
      score,
      createdAt: now,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "lead.created",
    resourceType: "Lead",
    resourceId: lead.id,
  });

  return lead;
}

export async function updateLead(acting: ActiveMembership, id: string, input: UpdateLeadInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.lead.findFirst({
    where: { id, organisationId: acting.organisationId },
  });
  if (!existing) throw new NotFoundError("Lead not found.");

  if (input.ownerId) {
    await assertMembershipInOrg(acting.organisationId, input.ownerId);
  }

  const ownerChanged = input.ownerId !== undefined && input.ownerId !== existing.ownerId;

  const lead = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({ where: { id }, data: input });
    if (ownerChanged) {
      await tx.leadOwnershipHistory.create({
        data: { leadId: id, fromOwnerId: existing.ownerId, toOwnerId: input.ownerId ?? null },
      });
    }
    // Recompute from the merged, post-update record — not the pre-update
    // one — so a field changed by this very call is reflected in the
    // new score.
    const { score } = calculateLeadScore(updated);
    return score === updated.score ? updated : tx.lead.update({ where: { id }, data: { score } });
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: ownerChanged ? "lead.reassigned" : "lead.updated",
    resourceType: "Lead",
    resourceId: lead.id,
    metadata: ownerChanged
      ? { fromOwnerId: existing.ownerId, toOwnerId: input.ownerId ?? null }
      : { fields: Object.keys(input) },
  });

  return lead;
}

export async function archiveLead(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.lead.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Lead not found.");

  const lead = await prisma.lead.update({
    where: { id },
    data: { status: LeadStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "lead.archived",
    resourceType: "Lead",
    resourceId: lead.id,
  });

  return lead;
}

/**
 * Converts a lead into a real Contact/Company. Either links to an existing
 * Company/Contact in this organisation (`input.companyId`/`contactId` —
 * verified same-tenant, never trusted blind) or creates one from the lead's
 * free-text fields (`companyName`, `firstName`/`lastName`/`email`/`phone`)
 * if nothing to link to was provided and the lead already had none. All in
 * one transaction so a partial conversion (e.g. company created but the
 * lead update fails) can never be left behind.
 */
export async function convertLead(acting: ActiveMembership, id: string, input: ConvertLeadInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const lead = await prisma.lead.findFirst({ where: { id, organisationId: acting.organisationId } });
  if (!lead) throw new NotFoundError("Lead not found.");
  if (lead.status === LeadStatus.CONVERTED) {
    throw new Error("This lead has already been converted.");
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

  const result = await prisma.$transaction(async (tx) => {
    let companyId = input.companyId ?? lead.companyId ?? null;
    let createdCompanyId: string | null = null;
    if (!companyId && lead.companyName) {
      const company = await tx.company.create({
        data: {
          organisationId: acting.organisationId,
          name: lead.companyName,
          ownerId: lead.ownerId,
        },
      });
      companyId = company.id;
      createdCompanyId = company.id;
    }

    let contactId = input.contactId ?? lead.contactId ?? null;
    let createdContactId: string | null = null;
    if (!contactId && (lead.firstName || lead.lastName || lead.email)) {
      const contact = await tx.contact.create({
        data: {
          organisationId: acting.organisationId,
          firstName: lead.firstName ?? "Unknown",
          lastName: lead.lastName ?? "",
          companyId,
          ownerId: lead.ownerId,
          leadSource: lead.source,
          emails: lead.email ? [{ address: lead.email, isPrimary: true }] : [],
          phones: lead.phone ? [{ number: lead.phone, isPrimary: true }] : [],
        },
      });
      contactId = contact.id;
      createdContactId = contact.id;
    }

    const updatedLead = await tx.lead.update({
      where: { id },
      data: { status: LeadStatus.CONVERTED, convertedAt: new Date(), companyId, contactId },
    });

    return { lead: updatedLead, createdCompanyId, createdContactId, companyId, contactId };
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "lead.converted",
    resourceType: "Lead",
    resourceId: id,
    metadata: { companyId: result.companyId, contactId: result.contactId },
  });
  if (result.createdCompanyId) {
    await writeAuditLog({
      organisationId: acting.organisationId,
      actorUserId: acting.userId,
      action: "company.created",
      resourceType: "Company",
      resourceId: result.createdCompanyId,
      metadata: { fromLeadId: id },
    });
  }
  if (result.createdContactId) {
    await writeAuditLog({
      organisationId: acting.organisationId,
      actorUserId: acting.userId,
      action: "contact.created",
      resourceType: "Contact",
      resourceId: result.createdContactId,
      metadata: { fromLeadId: id },
    });
  }

  return result;
}
