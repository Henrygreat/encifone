import { CompanyStatus, ContactStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateCompanyInput,
  CreateContactInput,
  ListCompaniesQuery,
  ListContactsQuery,
  UpdateCompanyInput,
  UpdateContactInput,
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
