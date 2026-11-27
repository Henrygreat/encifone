import { CompanyStatus, ContactStatus, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { calculateLeadScore } from "@/modules/intelligence/lead-scoring";
import { parseCsv, toCsvRow } from "@/lib/csv";
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

interface ContactEmailEntry {
  address: string;
  label?: string;
  isPrimary?: boolean;
}
interface ContactPhoneEntry {
  number: string;
  label?: string;
  isPrimary?: boolean;
}

function readContactEmails(value: unknown): ContactEmailEntry[] {
  return Array.isArray(value) ? (value as ContactEmailEntry[]) : [];
}
function readContactPhones(value: unknown): ContactPhoneEntry[] {
  return Array.isArray(value) ? (value as ContactPhoneEntry[]) : [];
}

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

// --- Bulk actions, duplicate detection, merge, CSV import/export (§5.3) ---
//
// Every bulk/merge operation re-derives its target set from
// `organisationId: acting.organisationId` rather than trusting that the
// caller-supplied ids are already tenant-scoped — an id for another
// organisation's record simply has no matching row and is silently
// excluded from the affected count, never acted upon.

export async function bulkArchiveContacts(acting: ActiveMembership, ids: string[]) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const result = await prisma.contact.updateMany({
    where: { id: { in: ids }, organisationId: acting.organisationId },
    data: { status: ContactStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.bulk_archived",
    resourceType: "Contact",
    metadata: { requestedCount: ids.length, affectedCount: result.count },
  });

  return { affectedCount: result.count };
}

export async function bulkReassignContactOwner(acting: ActiveMembership, ids: string[], ownerId: string | null) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (ownerId) {
    await assertMembershipInOrg(acting.organisationId, ownerId);
  }

  const result = await prisma.contact.updateMany({
    where: { id: { in: ids }, organisationId: acting.organisationId },
    data: { ownerId },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.bulk_reassigned",
    resourceType: "Contact",
    metadata: { requestedCount: ids.length, affectedCount: result.count, ownerId },
  });

  return { affectedCount: result.count };
}

export async function bulkAddContactTag(acting: ActiveMembership, ids: string[], tag: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, organisationId: acting.organisationId },
    select: { id: true, tags: true },
  });

  const toUpdate = contacts.filter((c) => !c.tags.includes(tag));
  await prisma.$transaction(
    toUpdate.map((c) => prisma.contact.update({ where: { id: c.id }, data: { tags: [...c.tags, tag] } }))
  );

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.bulk_tagged",
    resourceType: "Contact",
    metadata: { requestedCount: ids.length, affectedCount: toUpdate.length, tag },
  });

  return { affectedCount: toUpdate.length };
}

export interface DuplicateContactGroup {
  matchedOn: "email";
  value: string;
  contacts: { id: string; firstName: string; lastName: string; companyName: string | null }[];
}

/**
 * Email-address collisions only, for now — the one unambiguous signal
 * that doesn't need fuzzy name-matching heuristics. Read-only; merging
 * is a separate, explicit step so nothing is combined without a human
 * choosing which record to keep.
 */
export async function findDuplicateContacts(acting: ActiveMembership): Promise<DuplicateContactGroup[]> {
  requireCapability(acting, Capability.CRM_VIEW);

  const contacts = await prisma.contact.findMany({
    where: { organisationId: acting.organisationId, deletedAt: null },
    include: { company: { select: { name: true } } },
  });

  const byEmail = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    for (const email of readContactEmails(contact.emails)) {
      const key = email.address?.toLowerCase().trim();
      if (!key) continue;
      byEmail.set(key, [...(byEmail.get(key) ?? []), contact]);
    }
  }

  return Array.from(byEmail.entries())
    .filter(([, group]) => group.length > 1)
    .map(([value, group]) => ({
      matchedOn: "email" as const,
      value,
      contacts: group.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.company?.name ?? null,
      })),
    }));
}

/**
 * Safely merges `mergeId` into `keepId`: every other record that
 * referenced the loser (activities, leads, opportunities, clients,
 * proposals) is re-pointed at the survivor inside one transaction, tags
 * are unioned onto the survivor, and the loser is archived (never hard
 * deleted — its history stays auditable).
 */
export async function mergeContacts(acting: ActiveMembership, keepId: string, mergeId: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (keepId === mergeId) {
    throw new Error("Cannot merge a contact into itself.");
  }

  const [keep, merge] = await Promise.all([
    prisma.contact.findFirst({ where: { id: keepId, organisationId: acting.organisationId } }),
    prisma.contact.findFirst({ where: { id: mergeId, organisationId: acting.organisationId } }),
  ]);
  if (!keep) throw new NotFoundError("The contact to keep was not found in this organisation.");
  if (!merge) throw new NotFoundError("The contact to merge was not found in this organisation.");

  const merged = await prisma.$transaction(async (tx) => {
    await tx.activity.updateMany({
      where: { organisationId: acting.organisationId, entityType: "CONTACT", entityId: mergeId },
      data: { entityId: keepId },
    });
    await tx.lead.updateMany({
      where: { organisationId: acting.organisationId, contactId: mergeId },
      data: { contactId: keepId },
    });
    await tx.opportunity.updateMany({
      where: { organisationId: acting.organisationId, contactId: mergeId },
      data: { contactId: keepId },
    });
    await tx.client.updateMany({
      where: { organisationId: acting.organisationId, primaryContactId: mergeId },
      data: { primaryContactId: keepId },
    });
    await tx.proposal.updateMany({
      where: { organisationId: acting.organisationId, contactId: mergeId },
      data: { contactId: keepId },
    });

    const mergedTags = Array.from(new Set([...keep.tags, ...merge.tags]));
    const mergedEmails = [...readContactEmails(keep.emails)];
    for (const email of readContactEmails(merge.emails)) {
      if (!mergedEmails.some((e) => e.address.toLowerCase() === email.address.toLowerCase())) {
        mergedEmails.push({ ...email, isPrimary: false });
      }
    }

    const survivor = await tx.contact.update({
      where: { id: keepId },
      data: { tags: mergedTags, emails: mergedEmails as unknown as Prisma.InputJsonValue },
    });
    await tx.contact.update({
      where: { id: mergeId },
      data: { status: ContactStatus.ARCHIVED, deletedAt: new Date() },
    });
    return survivor;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.merged",
    resourceType: "Contact",
    resourceId: keepId,
    metadata: { mergedFromId: mergeId },
  });

  return merged;
}

export interface CsvImportRowError {
  row: number;
  message: string;
}
export interface CsvImportResult {
  createdCount: number;
  errorCount: number;
  errors: CsvImportRowError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Expects a header row with at least `firstName,lastName` — `email`,
 * `phone`, `jobTitle`, and `companyName` are optional columns. Every row
 * is validated independently; a bad row is skipped and reported, never
 * allowed to abort the rows around it or to silently fabricate a missing
 * required field.
 */
export async function importContactsCsv(acting: ActiveMembership, csvText: string): Promise<CsvImportResult> {
  requireCapability(acting, Capability.CRM_MANAGE);

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { createdCount: 0, errorCount: 0, errors: [] };
  }

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  const errors: CsvImportRowError[] = [];
  let createdCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // 1-indexed, plus the header row
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = (dataRows[i][index] ?? "").trim();
    });

    const firstName = record.firstName;
    const lastName = record.lastName;
    if (!firstName || !lastName) {
      errors.push({ row: rowNumber, message: "firstName and lastName are required." });
      continue;
    }
    if (record.email && !EMAIL_PATTERN.test(record.email)) {
      errors.push({ row: rowNumber, message: `"${record.email}" is not a valid email address.` });
      continue;
    }

    try {
      let companyId: string | undefined;
      if (record.companyName) {
        const existingCompany = await prisma.company.findFirst({
          where: { organisationId: acting.organisationId, name: record.companyName, deletedAt: null },
          select: { id: true },
        });
        companyId = existingCompany?.id ?? (await createCompany(acting, { name: record.companyName })).id;
      }

      await createContact(acting, {
        firstName,
        lastName,
        jobTitle: record.jobTitle || undefined,
        companyId,
        emails: record.email ? [{ address: record.email, isPrimary: true }] : undefined,
        phones: record.phone ? [{ number: record.phone, isPrimary: true }] : undefined,
      });
      createdCount++;
    } catch (error) {
      errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "Unknown error." });
    }
  }

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "contact.csv_imported",
    resourceType: "Contact",
    metadata: { createdCount, errorCount: errors.length },
  });

  return { createdCount, errorCount: errors.length, errors };
}

/** Every exported cell goes through `toCsvRow`, which guards against CSV
 * formula injection before quoting — see src/lib/csv.ts. */
export async function exportContactsCsv(acting: ActiveMembership): Promise<string> {
  requireCapability(acting, Capability.CRM_VIEW);

  const contacts = await prisma.contact.findMany({
    where: { organisationId: acting.organisationId, deletedAt: null },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = toCsvRow(["First name", "Last name", "Email", "Phone", "Job title", "Company", "Status", "Tags"]);
  const lines = contacts.map((contact) =>
    toCsvRow([
      contact.firstName,
      contact.lastName,
      readContactEmails(contact.emails)[0]?.address ?? "",
      readContactPhones(contact.phones)[0]?.number ?? "",
      contact.jobTitle ?? "",
      contact.company?.name ?? "",
      contact.status,
      contact.tags.join("; "),
    ])
  );

  return [header, ...lines].join("\r\n");
}

export async function bulkArchiveLeads(acting: ActiveMembership, ids: string[]) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const result = await prisma.lead.updateMany({
    where: { id: { in: ids }, organisationId: acting.organisationId },
    data: { status: LeadStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "lead.bulk_archived",
    resourceType: "Lead",
    metadata: { requestedCount: ids.length, affectedCount: result.count },
  });

  return { affectedCount: result.count };
}

export async function bulkReassignLeadOwner(acting: ActiveMembership, ids: string[], ownerId: string | null) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (ownerId) {
    await assertMembershipInOrg(acting.organisationId, ownerId);
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: ids }, organisationId: acting.organisationId },
    select: { id: true, ownerId: true },
  });

  await prisma.$transaction(
    leads.flatMap((lead) => {
      if (lead.ownerId === ownerId) return [];
      return [
        prisma.lead.update({ where: { id: lead.id }, data: { ownerId } }),
        prisma.leadOwnershipHistory.create({
          data: { leadId: lead.id, fromOwnerId: lead.ownerId, toOwnerId: ownerId },
        }),
      ];
    })
  );

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "lead.bulk_reassigned",
    resourceType: "Lead",
    metadata: { requestedCount: ids.length, affectedCount: leads.length, ownerId },
  });

  return { affectedCount: leads.length };
}
