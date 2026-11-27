import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActiveMembership } from "@/core/tenancy";
import { registerOwner } from "@/modules/identity/service";
import { createProject, getProject } from "@/modules/projects/service";
import { createWorkflowDefinition, triggerWorkflowExecution } from "@/modules/workflows/service";
import { membershipIdFor } from "../helpers/membership";

vi.mock("@/workers/queue-client", () => ({
  enqueueSystemJob: vi.fn().mockResolvedValue({ id: "mock-job" }),
}));

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@test.clientos.invalid`;
}

async function freshOrgOwner(prefix: string): Promise<ActiveMembership> {
  const owner = await registerOwner({
    name: `${prefix} Owner`,
    email: uniqueEmail(prefix),
    password: "password123",
    organisationName: `${prefix} Org ${randomUUID()}`,
  });
  createdOrgIds.push(owner.organisationId);
  createdUserIds.push(owner.userId);

  return {
    userId: owner.userId,
    organisationId: owner.organisationId,
    role: "ORGANISATION_OWNER",
    membershipId: await membershipIdFor(owner.userId, owner.organisationId),
  };
}

afterAll(async () => {
  await prisma.workflowExecution.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.workflowDefinition.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.projectMember.deleteMany({ where: { project: { organisationId: { in: createdOrgIds } } } });
  await prisma.project.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.membership.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
  await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Phase 3 tenant isolation", () => {
  it("rejects reading a project from another organisation", async () => {
    const orgA = await freshOrgOwner("Phase3ProjA");
    const orgB = await freshOrgOwner("Phase3ProjB");

    const project = await createProject(orgA, {
      name: `Cross Org Project ${randomUUID()}`,
      memberIds: [],
    });

    await expect(getProject(orgB, project.id)).rejects.toThrow(/project not found/i);
  });

  it("rejects triggering a workflow from another organisation", async () => {
    const orgA = await freshOrgOwner("Phase3FlowA");
    const orgB = await freshOrgOwner("Phase3FlowB");

    const flow = await createWorkflowDefinition(orgA, {
      name: `Org A Workflow ${randomUUID()}`,
      triggerEvent: "service_request.created",
      actions: [{ type: "create_project", name: "Generated project" }],
    });

    await expect(
      triggerWorkflowExecution(orgB, flow.id, `idem-${randomUUID()}`, { source: "cross-org" })
    ).rejects.toThrow(/workflow not found/i);
  });
});

describe("Phase 3 workflow idempotency", () => {
  it("creates one execution row for repeated trigger calls with the same idempotency key", async () => {
    const acting = await freshOrgOwner("Phase3Idem");

    const flow = await createWorkflowDefinition(acting, {
      name: `Idempotent Workflow ${randomUUID()}`,
      triggerEvent: "task.created",
      actions: [{ type: "create_notification", recipientMembershipId: acting.membershipId, title: "Task created" }],
    });

    const key = `idempotency-${randomUUID()}`;
    const first = await triggerWorkflowExecution(acting, flow.id, key, { taskName: "First" });
    const second = await triggerWorkflowExecution(acting, flow.id, key, { taskName: "Second" });

    expect(second.id).toBe(first.id);

    const count = await prisma.workflowExecution.count({
      where: {
        workflowDefinitionId: flow.id,
        idempotencyKey: key,
      },
    });
    expect(count).toBe(1);
  });
});
