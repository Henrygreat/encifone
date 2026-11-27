import { ServiceItemStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateServiceItemInput,
  ListServiceItemsQuery,
  UpdateServiceItemInput,
  UpdateServiceItemPriceInput,
} from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

export async function listServiceItems(acting: ActiveMembership, query: ListServiceItemsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ServiceItemWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.serviceItem.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.serviceItem.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function getServiceItem(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const item = await prisma.serviceItem.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: { priceHistory: { orderBy: { effectiveFrom: "desc" } } },
  });
  if (!item) throw new NotFoundError("Service item not found.");
  return item;
}

export async function createServiceItem(acting: ActiveMembership, input: CreateServiceItemInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceItem.create({
      data: {
        organisationId: acting.organisationId,
        name: input.name,
        description: input.description,
        sku: input.sku,
        unitPriceMinor: input.unitPriceMinor,
        currency: input.currency ?? "GBP",
        billingType: input.billingType ?? "ONE_OFF",
        status: input.status ?? ServiceItemStatus.ACTIVE,
      },
    });
    await tx.serviceItemPriceHistory.create({
      data: { serviceItemId: created.id, unitPriceMinor: created.unitPriceMinor, currency: created.currency },
    });
    return created;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.created",
    resourceType: "ServiceItem",
    resourceId: item.id,
  });

  return item;
}

export async function updateServiceItem(acting: ActiveMembership, id: string, input: UpdateServiceItemInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.serviceItem.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Service item not found.");

  const item = await prisma.serviceItem.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.updated",
    resourceType: "ServiceItem",
    resourceId: item.id,
    metadata: { fields: Object.keys(input) },
  });

  return item;
}

/** The only way a ServiceItem's price changes — always snapshotted into
 * ServiceItemPriceHistory, so a proposal line copied at an earlier price
 * never silently changes (docs/MASTER_ROADMAP.md 2.4's "historical price
 * snapshots" requirement). */
export async function updateServiceItemPrice(
  acting: ActiveMembership,
  id: string,
  input: UpdateServiceItemPriceInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.serviceItem.findFirst({ where: { id, organisationId: acting.organisationId } });
  if (!existing) throw new NotFoundError("Service item not found.");

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.serviceItem.update({
      where: { id },
      data: { unitPriceMinor: input.unitPriceMinor, currency: input.currency ?? existing.currency },
    });
    await tx.serviceItemPriceHistory.create({
      data: { serviceItemId: id, unitPriceMinor: updated.unitPriceMinor, currency: updated.currency },
    });
    return updated;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.price_changed",
    resourceType: "ServiceItem",
    resourceId: id,
    metadata: { fromMinor: existing.unitPriceMinor, toMinor: input.unitPriceMinor },
  });

  return item;
}

export async function archiveServiceItem(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.serviceItem.findFirst({
    where: { id, organisationId: acting.organisationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Service item not found.");

  const item = await prisma.serviceItem.update({
    where: { id },
    data: { status: ServiceItemStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.archived",
    resourceType: "ServiceItem",
    resourceId: item.id,
  });

  return item;
}
