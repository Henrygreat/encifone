import { KnowledgeArticleStatus } from "@prisma/client";
import { writeAuditLog } from "@/core/audit";
import { Capability } from "@/core/permissions";
import type { ActiveMembership } from "@/core/tenancy";
import { NotFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/modules/operations/auth";
import type { CreateArticleInput, CreateCategoryInput, ListArticlesQuery, UpdateArticleInput } from "./schemas";

async function assertArticleInOrg(organisationId: string, id: string) {
  const article = await prisma.knowledgeArticle.findFirst({ where: { id, organisationId } });
  if (!article) throw new NotFoundError("Knowledge article not found.");
  return article;
}

export async function listKnowledgeCategories(acting: ActiveMembership) {
  requireCapability(acting, Capability.KNOWLEDGE_VIEW);
  return prisma.knowledgeCategory.findMany({ where: { organisationId: acting.organisationId }, orderBy: { name: "asc" } });
}

export async function createKnowledgeCategory(acting: ActiveMembership, input: CreateCategoryInput) {
  requireCapability(acting, Capability.KNOWLEDGE_MANAGE);

  const category = await prisma.knowledgeCategory.create({
    data: {
      organisationId: acting.organisationId,
      name: input.name,
      description: input.description,
      isClientVisible: input.isClientVisible ?? false,
    },
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "knowledge.category_created",
    resourceType: "KnowledgeCategory",
    resourceId: category.id,
  });

  return category;
}

export async function listKnowledgeArticles(acting: ActiveMembership, query: ListArticlesQuery) {
  requireCapability(acting, Capability.KNOWLEDGE_VIEW);

  const where = {
    organisationId: acting.organisationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.clientVisibleOnly ? { isClientVisible: true } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: "insensitive" as const } }, { content: { contains: query.search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        owner: { select: { id: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.knowledgeArticle.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 1 };
}

export async function createKnowledgeArticle(acting: ActiveMembership, input: CreateArticleInput) {
  requireCapability(acting, Capability.KNOWLEDGE_MANAGE);

  const article = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeArticle.create({
      data: {
        organisationId: acting.organisationId,
        ownerMembershipId: acting.membershipId,
        categoryId: input.categoryId,
        title: input.title,
        slug: input.slug,
        content: input.content,
        tags: input.tags,
        status: input.status ?? KnowledgeArticleStatus.DRAFT,
        isClientVisible: input.isClientVisible ?? false,
        reviewDueAt: input.reviewDueAt,
        publishedAt: input.status === KnowledgeArticleStatus.PUBLISHED ? new Date() : null,
      },
    });

    await tx.knowledgeArticleVersion.create({
      data: {
        articleId: created.id,
        versionNumber: 1,
        title: created.title,
        content: created.content,
        createdByMembershipId: acting.membershipId,
      },
    });

    return created;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "knowledge.article_created",
    resourceType: "KnowledgeArticle",
    resourceId: article.id,
  });

  return article;
}

export async function updateKnowledgeArticle(acting: ActiveMembership, id: string, input: UpdateArticleInput) {
  requireCapability(acting, Capability.KNOWLEDGE_MANAGE);
  const existing = await assertArticleInOrg(acting.organisationId, id);

  const article = await prisma.$transaction(async (tx) => {
    const updated = await tx.knowledgeArticle.update({
      where: { id },
      data: {
        ...input,
        publishedAt:
          input.status === KnowledgeArticleStatus.PUBLISHED
            ? existing.publishedAt ?? new Date()
            : input.status
              ? null
              : undefined,
      },
    });

    const latestVersion = await tx.knowledgeArticleVersion.findFirst({
      where: { articleId: id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    await tx.knowledgeArticleVersion.create({
      data: {
        articleId: id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        title: updated.title,
        content: updated.content,
        createdByMembershipId: acting.membershipId,
      },
    });

    return updated;
  });

  await writeAuditLog({
    organisationId: acting.organisationId,
    actorUserId: acting.userId,
    action: "knowledge.article_updated",
    resourceType: "KnowledgeArticle",
    resourceId: id,
  });

  return article;
}
