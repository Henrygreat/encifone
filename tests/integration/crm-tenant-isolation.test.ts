import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import {
  archiveContact,
  createCompany,
  createContact,
  getCompany,
  getContact,
  listCompanies,
  listContacts,
  updateContact,
} from "@/modules/crm/service";
import { membershipIdFor } from "../helpers/membership";

/**
 * Mirrors tests/integration/tenant-isolation.test.ts for the new CRM
 * service — proves the actual enforcement points (never trust a
 * client-supplied organisationId/companyId/ownerId) against a real
 * database, not mocks. See docs/SECURITY.md §3.
 */

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

let orgAOwner: { userId: string; organisationId: string };
let orgBOwner: { userId: string; organisationId: string };
let actingAsOrgAOwner: ActiveMembership;
let actingAsOrgBOwner: ActiveMembership;
let actingAsOrgAClientUser: ActiveMembership;

beforeAll(async () => {
  orgAOwner = await registerOwner({
    name: "CRM Org A Owner",
    email: uniqueEmail("crm-owner-a"),
    password: "password123",
    organisationName: `CRM Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "CRM Org B Owner",
    email: uniqueEmail("crm-owner-b"),
    password: "password123",
    organisationName: `CRM Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  const orgAOwnerMembershipId = await membershipIdFor(orgAOwner.userId, orgAOwner.organisationId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: orgAOwnerMembershipId,
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgBOwner.userId, orgBOwner.organisationId),
  };
  actingAsOrgAClientUser = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "CLIENT_USER",
    membershipId: orgAOwnerMembershipId,
  };
});

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.company.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("CRM permission enforcement", () => {
  it("rejects a role with no CRM capability from viewing or creating contacts", async () => {
    await expect(listContacts(actingAsOrgAClientUser, { page: 1, pageSize: 25, sortBy: "createdAt", sortDir: "desc" })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(
      createContact(actingAsOrgAClientUser, { firstName: "Jane", lastName: "Doe" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("CRM tenant isolation", () => {
  it("never returns another organisation's contacts or companies", async () => {
    const companyA = await createCompany(actingAsOrgAOwner, { name: `Acme A ${randomUUID()}` });
    const companyB = await createCompany(actingAsOrgBOwner, { name: `Acme B ${randomUUID()}` });

    const contactA = await createContact(actingAsOrgAOwner, {
      firstName: "Alice",
      lastName: "A",
      companyId: companyA.id,
    });
    const contactB = await createContact(actingAsOrgBOwner, { firstName: "Bob", lastName: "B" });

    const orgAContacts = await listContacts(actingAsOrgAOwner, {
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect(orgAContacts.items.some((c) => c.id === contactA.id)).toBe(true);
    expect(orgAContacts.items.some((c) => c.id === contactB.id)).toBe(false);

    const orgACompanies = await listCompanies(actingAsOrgAOwner, {
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect(orgACompanies.items.some((c) => c.id === companyA.id)).toBe(true);
    expect(orgACompanies.items.some((c) => c.id === companyB.id)).toBe(false);

    // Org B's owner must not be able to fetch Org A's records by id, even
    // with a perfectly valid id — this is the direct-API-call attack this
    // suite exists to catch.
    await expect(getContact(actingAsOrgBOwner, contactA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCompany(actingAsOrgBOwner, companyA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects linking a contact to a company from a different organisation", async () => {
    const companyB = await createCompany(actingAsOrgBOwner, { name: `Cross-org company ${randomUUID()}` });

    await expect(
      createContact(actingAsOrgAOwner, { firstName: "Cross", lastName: "Org", companyId: companyB.id })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects assigning an owner membership from a different organisation", async () => {
    await expect(
      createContact(actingAsOrgAOwner, {
        firstName: "Bad",
        lastName: "Owner",
        ownerId: orgBOwner.userId, // a userId, not a membershipId — and from the wrong org either way
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archives a contact (soft delete) rather than hard-deleting it", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "ToArchive", lastName: "Contact" });
    const archived = await archiveContact(actingAsOrgAOwner, contact.id);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.deletedAt).not.toBeNull();

    // Still present in the database (not hard-deleted) — just excluded from
    // the default (non-archived) list view.
    const stillExists = await prisma.contact.findUnique({ where: { id: contact.id } });
    expect(stillExists).not.toBeNull();

    const defaultList = await listContacts(actingAsOrgAOwner, {
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect(defaultList.items.some((c) => c.id === contact.id)).toBe(false);
  });

  it("updating a contact writes an audit log entry scoped to the acting organisation", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "Audit", lastName: "Me" });
    await updateContact(actingAsOrgAOwner, contact.id, { jobTitle: "Updated Title" });

    const logs = await prisma.auditLog.findMany({
      where: { organisationId: actingAsOrgAOwner.organisationId, resourceId: contact.id, action: "contact.updated" },
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});
