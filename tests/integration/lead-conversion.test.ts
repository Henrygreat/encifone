import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import { convertLead, createCompany, createLead, getLead, listLeads, updateLead } from "@/modules/crm/service";

/**
 * Lead tenant isolation (mirrors tests/integration/crm-tenant-isolation.test.ts)
 * plus the conversion flow — the one multi-step transaction in the CRM
 * module so far, worth its own focused coverage.
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

beforeAll(async () => {
  orgAOwner = await registerOwner({
    name: "Lead Org A Owner",
    email: uniqueEmail("lead-owner-a"),
    password: "password123",
    organisationName: `Lead Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Lead Org B Owner",
    email: uniqueEmail("lead-owner-b"),
    password: "password123",
    organisationName: `Lead Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
  };
});

afterAll(async () => {
  await prisma.leadOwnershipHistory.deleteMany({ where: { lead: { organisationId: { in: createdOrgIds } } } });
  await prisma.lead.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.contact.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.company.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Lead tenant isolation", () => {
  it("never returns another organisation's leads", async () => {
    const leadA = await createLead(actingAsOrgAOwner, { firstName: "Lead", lastName: "A" });
    const leadB = await createLead(actingAsOrgBOwner, { firstName: "Lead", lastName: "B" });

    const orgALeads = await listLeads(actingAsOrgAOwner, {
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect(orgALeads.items.some((l) => l.id === leadA.id)).toBe(true);
    expect(orgALeads.items.some((l) => l.id === leadB.id)).toBe(false);

    await expect(getLead(actingAsOrgBOwner, leadA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects converting with a company/contact id from a different organisation", async () => {
    const companyB = await createCompany(actingAsOrgBOwner, { name: `Cross-org ${randomUUID()}` });
    const lead = await createLead(actingAsOrgAOwner, { firstName: "Cross", lastName: "Org" });

    await expect(convertLead(actingAsOrgAOwner, lead.id, { companyId: companyB.id })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe("Lead conversion", () => {
  it("creates a Company and Contact from free-text fields and marks the lead CONVERTED", async () => {
    const lead = await createLead(actingAsOrgAOwner, {
      firstName: "Nadia",
      lastName: "Prospect",
      email: "nadia@newbiz.test",
      companyName: `New Biz ${randomUUID()}`,
      source: "Website form",
    });

    const result = await convertLead(actingAsOrgAOwner, lead.id, {});

    expect(result.lead.status).toBe("CONVERTED");
    expect(result.lead.convertedAt).not.toBeNull();
    expect(result.createdCompanyId).not.toBeNull();
    expect(result.createdContactId).not.toBeNull();

    const company = await prisma.company.findUnique({ where: { id: result.createdCompanyId! } });
    expect(company?.organisationId).toBe(actingAsOrgAOwner.organisationId);

    const contact = await prisma.contact.findUnique({ where: { id: result.createdContactId! } });
    expect(contact?.companyId).toBe(result.createdCompanyId);
    expect(contact?.firstName).toBe("Nadia");

    // Converting an already-converted lead must be rejected, not silently
    // re-run (which would create a second Company/Contact pair).
    await expect(convertLead(actingAsOrgAOwner, lead.id, {})).rejects.toThrow(
      "This lead has already been converted."
    );
  });

  it("links to an existing company/contact instead of creating duplicates when ids are provided", async () => {
    const existingCompany = await createCompany(actingAsOrgAOwner, { name: `Existing Co ${randomUUID()}` });
    const lead = await createLead(actingAsOrgAOwner, {
      firstName: "Link",
      lastName: "ToExisting",
      companyName: "Should be ignored in favour of the explicit companyId",
    });

    const result = await convertLead(actingAsOrgAOwner, lead.id, { companyId: existingCompany.id });

    expect(result.createdCompanyId).toBeNull();
    expect(result.companyId).toBe(existingCompany.id);
  });

  it("writes a LeadOwnershipHistory entry when the owner is reassigned", async () => {
    const lead = await createLead(actingAsOrgAOwner, { firstName: "Owned", lastName: "Lead" });

    // acting user's own membership id for simplicity — assertMembershipInOrg
    // only cares that the membership belongs to this org.
    const membership = await prisma.membership.findFirst({
      where: { organisationId: actingAsOrgAOwner.organisationId, userId: actingAsOrgAOwner.userId },
    });

    await updateLead(actingAsOrgAOwner, lead.id, { ownerId: membership!.id });

    const history = await prisma.leadOwnershipHistory.findMany({ where: { leadId: lead.id } });
    expect(history.length).toBe(1);
    expect(history[0].toOwnerId).toBe(membership!.id);
    expect(history[0].fromOwnerId).toBeNull();
  });
});
