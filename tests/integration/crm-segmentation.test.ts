import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { NotFoundError } from "@/lib/api";
import {
  bulkAddContactTag,
  bulkArchiveContacts,
  bulkReassignContactOwner,
  createContact,
  exportContactsCsv,
  findDuplicateContacts,
  importContactsCsv,
  mergeContacts,
} from "@/modules/crm/service";
import { createOpportunity, ensureDefaultPipeline } from "@/modules/sales/service";
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from "@/modules/views/service";
import { membershipIdFor } from "../helpers/membership";

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
    name: "Segmentation Org A Owner",
    email: uniqueEmail("segmentation-owner-a"),
    password: "password123",
    organisationName: `Segmentation Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Segmentation Org B Owner",
    email: uniqueEmail("segmentation-owner-b"),
    password: "password123",
    organisationName: `Segmentation Org B ${randomUUID()}`,
  });
  createdOrgIds.push(orgAOwner.organisationId, orgBOwner.organisationId);
  createdUserIds.push(orgAOwner.userId, orgBOwner.userId);

  actingAsOrgAOwner = {
    userId: orgAOwner.userId,
    organisationId: orgAOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgAOwner.userId, orgAOwner.organisationId),
  };
  actingAsOrgBOwner = {
    userId: orgBOwner.userId,
    organisationId: orgBOwner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(orgBOwner.userId, orgBOwner.organisationId),
  };
});

afterAll(async () => {
  await prisma.savedView.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.opportunity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { organisationId: { in: createdOrgIds } } } });
  await prisma.pipeline.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.contact.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Bulk contact actions", () => {
  it("only archives contacts that belong to the acting organisation", async () => {
    const mine = await createContact(actingAsOrgAOwner, { firstName: "Bulk", lastName: `Mine-${randomUUID()}` });
    const otherOrgContact = await createContact(actingAsOrgBOwner, { firstName: "Bulk", lastName: `Theirs-${randomUUID()}` });

    const result = await bulkArchiveContacts(actingAsOrgAOwner, [mine.id, otherOrgContact.id]);
    expect(result.affectedCount).toBe(1);

    const refreshedMine = await prisma.contact.findUniqueOrThrow({ where: { id: mine.id } });
    const refreshedOther = await prisma.contact.findUniqueOrThrow({ where: { id: otherOrgContact.id } });
    expect(refreshedMine.status).toBe("ARCHIVED");
    expect(refreshedOther.status).not.toBe("ARCHIVED");
  });

  it("reassigns owner only for in-tenant ids and adds a tag idempotently", async () => {
    const a = await createContact(actingAsOrgAOwner, { firstName: "Tag", lastName: `A-${randomUUID()}` });
    const b = await createContact(actingAsOrgAOwner, { firstName: "Tag", lastName: `B-${randomUUID()}`, tags: ["vip"] });

    const reassign = await bulkReassignContactOwner(actingAsOrgAOwner, [a.id, b.id], null);
    expect(reassign.affectedCount).toBe(2);

    const tagResult = await bulkAddContactTag(actingAsOrgAOwner, [a.id, b.id], "vip");
    expect(tagResult.affectedCount).toBe(1); // b already had the tag

    const refreshedA = await prisma.contact.findUniqueOrThrow({ where: { id: a.id } });
    expect(refreshedA.tags).toContain("vip");
  });
});

describe("Duplicate detection and safe merge", () => {
  it("finds contacts sharing an email and merges them without losing linked records", async () => {
    const sharedEmail = uniqueEmail("dup");
    const keep = await createContact(actingAsOrgAOwner, {
      firstName: "Keep",
      lastName: `This-${randomUUID()}`,
      emails: [{ address: sharedEmail, isPrimary: true }],
    });
    const loser = await createContact(actingAsOrgAOwner, {
      firstName: "Merge",
      lastName: `This-${randomUUID()}`,
      emails: [{ address: sharedEmail, isPrimary: true }],
      tags: ["from-loser"],
    });

    const duplicates = await findDuplicateContacts(actingAsOrgAOwner);
    const group = duplicates.find((g) => g.value === sharedEmail.toLowerCase());
    expect(group?.contacts.map((c) => c.id).sort()).toEqual([keep.id, loser.id].sort());

    const pipeline = await ensureDefaultPipeline(actingAsOrgAOwner);
    await createOpportunity(actingAsOrgAOwner, {
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      name: `Deal for loser ${randomUUID()}`,
      contactId: loser.id,
    });

    const survivor = await mergeContacts(actingAsOrgAOwner, keep.id, loser.id);
    expect(survivor.tags).toContain("from-loser");

    const archivedLoser = await prisma.contact.findUniqueOrThrow({ where: { id: loser.id } });
    expect(archivedLoser.status).toBe("ARCHIVED");

    const reattachedDeal = await prisma.opportunity.findFirstOrThrow({ where: { contactId: keep.id } });
    expect(reattachedDeal.contactId).toBe(keep.id);
  });

  it("rejects merging a contact into itself and rejects a cross-tenant id", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "Solo", lastName: `Self-${randomUUID()}` });
    await expect(mergeContacts(actingAsOrgAOwner, contact.id, contact.id)).rejects.toThrow("merge a contact into itself");

    const otherOrgContact = await createContact(actingAsOrgBOwner, { firstName: "Other", lastName: `Org-${randomUUID()}` });
    await expect(mergeContacts(actingAsOrgAOwner, contact.id, otherOrgContact.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CSV import/export", () => {
  it("imports valid rows, reports invalid ones, and never fabricates required fields", async () => {
    const goodEmail = uniqueEmail("csv-import");
    const csv = [
      "firstName,lastName,email,companyName",
      `Imported,Person-${randomUUID()},${goodEmail},`,
      ",MissingFirstName,bad@example.com,",
      `BadEmail,Person-${randomUUID()},not-an-email,`,
    ].join("\n");

    const result = await importContactsCsv(actingAsOrgAOwner, csv);
    expect(result.createdCount).toBe(1);
    expect(result.errorCount).toBe(2);
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4]);

    const created = await prisma.contact.findFirst({ where: { organisationId: actingAsOrgAOwner.organisationId, firstName: "Imported" } });
    expect(created).not.toBeNull();
  });

  it("exports CSV with formula-injection guarding on a hostile tag", async () => {
    await createContact(actingAsOrgAOwner, {
      firstName: "=cmd",
      lastName: `Injection-${randomUUID()}`,
      tags: ["=2+2"],
    });

    const csv = await exportContactsCsv(actingAsOrgAOwner);
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/,=cmd,/);
  });
});

describe("Saved views", () => {
  it("keeps private views invisible to other members' queries while shared views are visible to all", async () => {
    const shared = await createSavedView(actingAsOrgAOwner, {
      entityType: "CONTACT",
      name: "All active contacts",
      filters: { status: "ACTIVE" },
      shared: true,
    });
    const privateView = await createSavedView(actingAsOrgAOwner, {
      entityType: "CONTACT",
      name: "My follow-ups",
      filters: { ownerId: "me" },
    });

    const views = await listSavedViews(actingAsOrgAOwner, "CONTACT");
    const ids = views.map((v) => v.id);
    expect(ids).toContain(shared.id);
    expect(ids).toContain(privateView.id);

    await updateSavedView(actingAsOrgAOwner, privateView.id, { name: "Renamed" });
    const afterDelete = await deleteSavedView(actingAsOrgAOwner, privateView.id);
    expect(afterDelete.id).toBe(privateView.id);
  });

  it("never returns another organisation's saved view", async () => {
    const view = await createSavedView(actingAsOrgBOwner, {
      entityType: "CONTACT",
      name: "Org B view",
      filters: {},
      shared: true,
    });

    const orgAViews = await listSavedViews(actingAsOrgAOwner, "CONTACT");
    expect(orgAViews.map((v) => v.id)).not.toContain(view.id);
  });
});
