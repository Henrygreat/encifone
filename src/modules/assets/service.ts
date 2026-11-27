import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type { CreateAssetInput, ListAssetsQuery, UpdateAssetInput } from "./schemas";

async function assertAssetInOrg(organisationId: string, id: string) {
  const asset = await prisma.asset.findFirst({ where: { id, organisationId } });
  if (!asset) throw new NotFoundError("Asset not found.");
  return asset;
}

export async function listAssets(acting: ActiveMembership, query: ListAssetsQuery) {
  requireCapability(acting, Capability.ASSET_VIEW);

  const where = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.ownershipType ? { ownershipType: query.ownershipType } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { reference: { contains: query.search, mode: "insensitive" as const } }, { type: { contains: query.search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getAsset(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.ASSET_VIEW);
  const asset = await prisma.asset.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      assignmentHistory: { orderBy: { changedAt: "desc" }, take: 100 },
      tickets: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!asset) throw new NotFoundError("Asset not found.");
  return asset;
}

export async function createAsset(acting: ActiveMembership, input: CreateAssetInput) {
  requireCapability(acting, Capability.ASSET_MANAGE);

  const asset = await prisma.asset.create({ data: { organisationId: acting.organisationId, ...input } });

  await prisma.assetActivity.create({
    data: {
      organisationId: acting.organisationId,
      assetId: asset.id,
      performedByMembershipId: acting.membershipId,
      activityType: "CREATED",
      details: "Asset created",
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "asset.created",
    resourceType: "Asset",
    resourceId: asset.id,
  });

  return asset;
}

export async function updateAsset(acting: ActiveMembership, id: string, input: UpdateAssetInput) {
  requireCapability(acting, Capability.ASSET_MANAGE);
  const existing = await assertAssetInOrg(acting.organisationId, id);

  const asset = await prisma.$transaction(async (tx) => {
    const updated = await tx.asset.update({ where: { id }, data: input });

    if (input.assignedMembershipId !== undefined && input.assignedMembershipId !== existing.assignedMembershipId) {
      await tx.assetAssignmentHistory.create({
        data: {
          assetId: id,
          fromMembershipId: existing.assignedMembershipId,
          toMembershipId: input.assignedMembershipId,
          changedByMembershipId: acting.membershipId,
        },
      });
    }

    await tx.assetActivity.create({
      data: {
        organisationId: acting.organisationId,
        assetId: id,
        performedByMembershipId: acting.membershipId,
        activityType: "UPDATED",
        details: "Asset updated",
      },
    });

    return updated;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "asset.updated",
    resourceType: "Asset",
    resourceId: id,
  });

  return asset;
}
