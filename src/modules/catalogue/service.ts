import {
  Prisma,
  ServiceItemStatus,
  ServicePackageStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/core/audit";
import { Capability, ForbiddenError, roleHasCapability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import type {
  CreateServiceCategoryInput,
  CreateServiceCatalogueSavedViewInput,
  CreateServiceItemInput,
  CreateServicePackageInput,
  LinkServiceToClientInput,
  LinkServiceToContractInput,
  ListServiceCategoriesQuery,
  ListServiceItemsQuery,
  ListServicePackagesQuery,
  SetServiceDependenciesInput,
  UpdateServiceCategoryInput,
  UpdateServiceItemInput,
  UpdateServiceItemPriceInput,
  UpdateServicePackageInput,
} from "./schemas";

function requireCapability(acting: ActiveMembership, capability: Capability) {
  if (!roleHasCapability(acting.role, capability)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

async function assertServiceItemInOrg(organisationId: string, id: string) {
  const item = await prisma.serviceItem.findFirst({ where: { id, organisationId, deletedAt: null } });
  if (!item) throw new NotFoundError("Service item not found.");
  return item;
}

async function assertCategoryInOrg(organisationId: string, id: string) {
  const category = await prisma.serviceCategory.findFirst({ where: { id, organisationId } });
  if (!category) throw new NotFoundError("Service category not found.");
  return category;
}

async function assertClientInOrg(organisationId: string, id: string) {
  const client = await prisma.client.findFirst({ where: { id, organisationId, deletedAt: null } });
  if (!client) throw new NotFoundError("Client not found.");
  return client;
}

async function assertContractInOrg(organisationId: string, id: string) {
  const contract = await prisma.contract.findFirst({ where: { id, organisationId, deletedAt: null } });
  if (!contract) throw new NotFoundError("Contract not found.");
  return contract;
}

export async function listServiceItems(acting: ActiveMembership, query: ListServiceItemsQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ServiceItemWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.billingType ? { billingType: query.billingType } : {}),
    ...(query.commercialModel ? { commercialModel: query.commercialModel } : {}),
    ...(query.templateOnly ? { isTemplate: true } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.serviceItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        dependencies: { select: { dependsOnServiceId: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.serviceItem.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getServiceItem(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_VIEW);

  const item = await prisma.serviceItem.findFirst({
    where: { id, organisationId: acting.organisationId },
    include: {
      category: true,
      priceHistory: { orderBy: { effectiveFrom: "desc" } },
      dependencies: {
        include: {
          dependsOnService: {
            select: { id: true, name: true, status: true },
          },
        },
      },
      packageItems: {
        include: {
          servicePackage: { select: { id: true, name: true, status: true } },
        },
      },
      linkedClients: { include: { client: { select: { id: true, name: true, lifecycleStage: true } } } },
      linkedContracts: { include: { contract: { select: { id: true, title: true, status: true } } } },
    },
  });
  if (!item) throw new NotFoundError("Service item not found.");
  return item;
}

export async function createServiceItem(acting: ActiveMembership, input: CreateServiceItemInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.categoryId) await assertCategoryInOrg(acting.organisationId, input.categoryId);

  const item = await prisma.$transaction(async (tx) => {
    const data: Prisma.ServiceItemCreateInput = {
      organisation: { connect: { id: acting.organisationId } },
      ...(input.categoryId ? { category: { connect: { id: input.categoryId } } } : {}),
      name: input.name,
      description: input.description,
      deliverables: input.deliverables,
      estimatedDeliveryDays: input.estimatedDeliveryDays,
      requiredSkills: input.requiredSkills ?? [],
      sku: input.sku,
      unitPriceMinor: input.unitPriceMinor,
      internalCostMinor: input.internalCostMinor,
      currency: input.currency ?? "GBP",
      billingType: input.billingType ?? "ONE_OFF",
      commercialModel: input.commercialModel ?? "FIXED_PRICE",
      slaSummary: input.slaSummary,
      onboardingRequirements: input.onboardingRequirements as Prisma.InputJsonValue | undefined,
      documentRequirements: input.documentRequirements as Prisma.InputJsonValue | undefined,
      projectTemplate: input.projectTemplate as Prisma.InputJsonValue | undefined,
      taskTemplate: input.taskTemplate as Prisma.InputJsonValue | undefined,
      isTemplate: input.isTemplate ?? false,
      status: input.status ?? ServiceItemStatus.ACTIVE,
    };

    const created = await tx.serviceItem.create({
      data,
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

  await assertServiceItemInOrg(acting.organisationId, id);
  if (input.categoryId) await assertCategoryInOrg(acting.organisationId, input.categoryId);

  const {
    categoryId,
    onboardingRequirements,
    documentRequirements,
    projectTemplate,
    taskTemplate,
    ...rest
  } = input;

  const data: Prisma.ServiceItemUpdateInput = {
    ...rest,
    ...(categoryId === undefined
      ? {}
      : categoryId
        ? { category: { connect: { id: categoryId } } }
        : { category: { disconnect: true } }),
    ...(onboardingRequirements === undefined
      ? {}
      : { onboardingRequirements: onboardingRequirements as Prisma.InputJsonValue }),
    ...(documentRequirements === undefined
      ? {}
      : { documentRequirements: documentRequirements as Prisma.InputJsonValue }),
    ...(projectTemplate === undefined ? {} : { projectTemplate: projectTemplate as Prisma.InputJsonValue }),
    ...(taskTemplate === undefined ? {} : { taskTemplate: taskTemplate as Prisma.InputJsonValue }),
  };

  const item = await prisma.serviceItem.update({ where: { id }, data });

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

export async function updateServiceItemPrice(
  acting: ActiveMembership,
  id: string,
  input: UpdateServiceItemPriceInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await assertServiceItemInOrg(acting.organisationId, id);

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

  await assertServiceItemInOrg(acting.organisationId, id);

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

export async function setServiceDependencies(
  acting: ActiveMembership,
  serviceItemId: string,
  input: SetServiceDependenciesInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  await assertServiceItemInOrg(acting.organisationId, serviceItemId);

  const deduped = [...new Set(input.dependencyIds)].filter((id) => id !== serviceItemId);
  if (deduped.length > 0) {
    const valid = await prisma.serviceItem.count({
      where: { organisationId: acting.organisationId, id: { in: deduped }, deletedAt: null },
    });
    if (valid !== deduped.length) {
      throw new NotFoundError("One or more dependency services were not found.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceDependency.deleteMany({ where: { serviceItemId } });
    if (deduped.length > 0) {
      await tx.serviceDependency.createMany({
        data: deduped.map((dependsOnServiceId) => ({ serviceItemId, dependsOnServiceId })),
      });
    }
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.dependencies_updated",
    resourceType: "ServiceItem",
    resourceId: serviceItemId,
    metadata: { dependencyCount: deduped.length },
  });

  return getServiceItem(acting, serviceItemId);
}

export async function linkServiceToClient(
  acting: ActiveMembership,
  serviceItemId: string,
  input: LinkServiceToClientInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertServiceItemInOrg(acting.organisationId, serviceItemId);
  await assertClientInOrg(acting.organisationId, input.clientId);

  const link = await prisma.serviceItemClientLink.upsert({
    where: { serviceItemId_clientId: { serviceItemId, clientId: input.clientId } },
    update: {},
    create: { serviceItemId, clientId: input.clientId },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.client_linked",
    resourceType: "ServiceItem",
    resourceId: serviceItemId,
    metadata: { clientId: input.clientId },
  });

  return link;
}

export async function unlinkServiceFromClient(acting: ActiveMembership, serviceItemId: string, clientId: string) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertServiceItemInOrg(acting.organisationId, serviceItemId);

  await prisma.serviceItemClientLink.deleteMany({ where: { serviceItemId, clientId } });
  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.client_unlinked",
    resourceType: "ServiceItem",
    resourceId: serviceItemId,
    metadata: { clientId },
  });
}

export async function linkServiceToContract(
  acting: ActiveMembership,
  serviceItemId: string,
  input: LinkServiceToContractInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertServiceItemInOrg(acting.organisationId, serviceItemId);
  await assertContractInOrg(acting.organisationId, input.contractId);

  const link = await prisma.serviceItemContractLink.upsert({
    where: { serviceItemId_contractId: { serviceItemId, contractId: input.contractId } },
    update: {},
    create: { serviceItemId, contractId: input.contractId },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.contract_linked",
    resourceType: "ServiceItem",
    resourceId: serviceItemId,
    metadata: { contractId: input.contractId },
  });

  return link;
}

export async function unlinkServiceFromContract(acting: ActiveMembership, serviceItemId: string, contractId: string) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertServiceItemInOrg(acting.organisationId, serviceItemId);

  await prisma.serviceItemContractLink.deleteMany({ where: { serviceItemId, contractId } });
  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_item.contract_unlinked",
    resourceType: "ServiceItem",
    resourceId: serviceItemId,
    metadata: { contractId },
  });
}

export async function listServiceCategories(acting: ActiveMembership, query: ListServiceCategoriesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  return prisma.serviceCategory.findMany({
    where: {
      organisationId: acting.organisationId,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createServiceCategory(acting: ActiveMembership, input: CreateServiceCategoryInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const category = await prisma.serviceCategory.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_category.created",
    resourceType: "ServiceCategory",
    resourceId: category.id,
  });

  return category;
}

export async function updateServiceCategory(
  acting: ActiveMembership,
  id: string,
  input: UpdateServiceCategoryInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertCategoryInOrg(acting.organisationId, id);

  const category = await prisma.serviceCategory.update({ where: { id }, data: input });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_category.updated",
    resourceType: "ServiceCategory",
    resourceId: category.id,
    metadata: { fields: Object.keys(input) },
  });

  return category;
}

export async function deleteServiceCategory(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);
  await assertCategoryInOrg(acting.organisationId, id);

  const inUse = await prisma.serviceItem.count({ where: { organisationId: acting.organisationId, categoryId: id, deletedAt: null } });
  if (inUse > 0) {
    throw new ForbiddenError("Category cannot be deleted while active services still reference it.");
  }

  await prisma.serviceCategory.delete({ where: { id } });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_category.deleted",
    resourceType: "ServiceCategory",
    resourceId: id,
  });
}

export async function listServicePackages(acting: ActiveMembership, query: ListServicePackagesQuery) {
  requireCapability(acting, Capability.CRM_VIEW);

  const where: Prisma.ServicePackageWhereInput = {
    organisationId: acting.organisationId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.servicePackage.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        items: {
          include: { serviceItem: { select: { id: true, name: true, status: true } } },
          orderBy: { position: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.servicePackage.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function createServicePackage(acting: ActiveMembership, input: CreateServicePackageInput) {
  requireCapability(acting, Capability.CRM_MANAGE);

  if (input.categoryId) await assertCategoryInOrg(acting.organisationId, input.categoryId);

  const uniqueServiceIds = [...new Set(input.items.map((item) => item.serviceItemId))];
  const validCount = await prisma.serviceItem.count({
    where: { organisationId: acting.organisationId, id: { in: uniqueServiceIds }, deletedAt: null },
  });
  if (validCount !== uniqueServiceIds.length) {
    throw new NotFoundError("One or more services in this package were not found.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const pkg = await tx.servicePackage.create({
      data: {
        organisationId: acting.organisationId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        status: input.status ?? ServicePackageStatus.DRAFT,
        fixedPriceMinor: input.fixedPriceMinor,
        currency: input.currency ?? "GBP",
        estimatedDeliveryDays: input.estimatedDeliveryDays,
      },
    });

    await tx.servicePackageItem.createMany({
      data: input.items.map((item, index) => ({
        servicePackageId: pkg.id,
        serviceItemId: item.serviceItemId,
        quantity: item.quantity ?? 1,
        position: index,
      })),
    });

    return pkg;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_package.created",
    resourceType: "ServicePackage",
    resourceId: created.id,
    metadata: { itemCount: input.items.length },
  });

  return created;
}

export async function updateServicePackage(
  acting: ActiveMembership,
  id: string,
  input: UpdateServicePackageInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.servicePackage.findFirst({
    where: { id, organisationId: acting.organisationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Service package not found.");

  if (input.categoryId) await assertCategoryInOrg(acting.organisationId, input.categoryId);

  const { categoryId, ...rest } = input;
  const data: Prisma.ServicePackageUpdateInput = {
    ...rest,
    ...(categoryId === undefined
      ? {}
      : categoryId
        ? { category: { connect: { id: categoryId } } }
        : { category: { disconnect: true } }),
  };

  const pkg = await prisma.servicePackage.update({ where: { id }, data });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_package.updated",
    resourceType: "ServicePackage",
    resourceId: pkg.id,
    metadata: { fields: Object.keys(input) },
  });

  return pkg;
}

export async function archiveServicePackage(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const existing = await prisma.servicePackage.findFirst({
    where: { id, organisationId: acting.organisationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Service package not found.");

  const pkg = await prisma.servicePackage.update({
    where: { id },
    data: { status: ServicePackageStatus.ARCHIVED, deletedAt: new Date() },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_package.archived",
    resourceType: "ServicePackage",
    resourceId: id,
  });

  return pkg;
}

export async function listServiceCatalogueSavedViews(acting: ActiveMembership) {
  requireCapability(acting, Capability.CRM_VIEW);

  return prisma.serviceCatalogueSavedView.findMany({
    where: {
      organisationId: acting.organisationId,
      OR: [{ ownerId: null }, { ownerId: acting.membershipId }],
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function createServiceCatalogueSavedView(
  acting: ActiveMembership,
  input: CreateServiceCatalogueSavedViewInput
) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const ownerId = input.shared ? null : acting.membershipId;

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.serviceCatalogueSavedView.updateMany({
        where: {
          organisationId: acting.organisationId,
          ownerId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const view = await tx.serviceCatalogueSavedView.create({
      data: {
        organisationId: acting.organisationId,
        ownerId,
        name: input.name,
        filters: input.filters as Prisma.InputJsonValue,
        isDefault: input.isDefault ?? false,
      },
    });

    await writeAuditLog({
      organisationId: acting.organisationId,
      actorUserId: acting.userId,
      action: "service_saved_view.created",
      resourceType: "ServiceCatalogueSavedView",
      resourceId: view.id,
      metadata: { shared: input.shared ?? false },
    });

    return view;
  });
}

export async function deleteServiceCatalogueSavedView(acting: ActiveMembership, id: string) {
  requireCapability(acting, Capability.CRM_MANAGE);

  const view = await prisma.serviceCatalogueSavedView.findFirst({
    where: {
      id,
      organisationId: acting.organisationId,
      OR: [{ ownerId: null }, { ownerId: acting.membershipId }],
    },
  });
  if (!view) throw new NotFoundError("Service catalogue saved view not found.");

  await prisma.serviceCatalogueSavedView.delete({ where: { id } });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "service_saved_view.deleted",
    resourceType: "ServiceCatalogueSavedView",
    resourceId: id,
  });
}
