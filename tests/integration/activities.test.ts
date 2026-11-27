import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { createContact } from "@/modules/crm/service";
import { NotFoundError } from "@/lib/api";
import { completeActivity, createActivity, getActivity, listActivities } from "@/modules/activities/service";
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
    name: "Activity Org A Owner",
    email: uniqueEmail("activity-owner-a"),
    password: "password123",
    organisationName: `Activity Org A ${randomUUID()}`,
  });
  orgBOwner = await registerOwner({
    name: "Activity Org B Owner",
    email: uniqueEmail("activity-owner-b"),
    password: "password123",
    organisationName: `Activity Org B ${randomUUID()}`,
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
  await prisma.activity.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.contact.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Activity creation semantics", () => {
  it("logs a NOTE as already-completed with no dueAt expected", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "Timeline", lastName: "Subject" });
    const activity = await createActivity(actingAsOrgAOwner, {
      entityType: "CONTACT",
      entityId: contact.id,
      type: "NOTE",
      subject: "Had a great first call",
    });

    expect(activity.status).toBe("COMPLETED");
    expect(activity.completedAt).not.toBeNull();
  });

  it("creates a TASK as OPEN with the given due date", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "Followup", lastName: "Needed" });
    const dueAt = new Date(Date.now() + 86_400_000);
    const activity = await createActivity(actingAsOrgAOwner, {
      entityType: "CONTACT",
      entityId: contact.id,
      type: "TASK",
      subject: "Send proposal",
      dueAt,
    });

    expect(activity.status).toBe("OPEN");
    expect(activity.completedAt).toBeNull();
    expect(activity.dueAt?.toISOString()).toBe(dueAt.toISOString());
  });

  it("rejects attaching an activity to an entity from a different organisation", async () => {
    const contactB = await createContact(actingAsOrgBOwner, { firstName: "Other", lastName: "Org" });

    await expect(
      createActivity(actingAsOrgAOwner, {
        entityType: "CONTACT",
        entityId: contactB.id,
        type: "NOTE",
        subject: "Should fail",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects attaching an activity to a non-existent entity id", async () => {
    await expect(
      createActivity(actingAsOrgAOwner, {
        entityType: "CONTACT",
        entityId: "does-not-exist",
        type: "NOTE",
        subject: "Should fail",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Activity tenant isolation", () => {
  it("never returns another organisation's activities", async () => {
    const contactA = await createContact(actingAsOrgAOwner, { firstName: "A", lastName: "Contact" });
    const contactB = await createContact(actingAsOrgBOwner, { firstName: "B", lastName: "Contact" });

    const activityA = await createActivity(actingAsOrgAOwner, {
      entityType: "CONTACT",
      entityId: contactA.id,
      type: "CALL",
      subject: "Call A",
    });
    await createActivity(actingAsOrgBOwner, {
      entityType: "CONTACT",
      entityId: contactB.id,
      type: "CALL",
      subject: "Call B",
    });

    const orgAList = await listActivities(actingAsOrgAOwner, {
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect(orgAList.items.some((a) => a.id === activityA.id)).toBe(true);
    expect(orgAList.items.some((a) => a.subject === "Call B")).toBe(false);

    await expect(getActivity(actingAsOrgBOwner, activityA.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Marking an activity complete", () => {
  it("sets status COMPLETED and completedAt, and reopening clears completedAt", async () => {
    const contact = await createContact(actingAsOrgAOwner, { firstName: "Task", lastName: "Owner" });
    const task = await createActivity(actingAsOrgAOwner, {
      entityType: "CONTACT",
      entityId: contact.id,
      type: "TASK",
      subject: "Chase invoice",
      dueAt: new Date(),
    });
    expect(task.status).toBe("OPEN");

    const completed = await completeActivity(actingAsOrgAOwner, task.id);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).not.toBeNull();
  });
});
