import { KnowledgeArticleStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listArticlesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(KnowledgeArticleStatus).optional(),
  categoryId: z.string().cuid().optional(),
  clientVisibleOnly: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(4000).optional(),
  isClientVisible: z.boolean().optional(),
});

export const createArticleSchema = z.object({
  categoryId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  status: z.nativeEnum(KnowledgeArticleStatus).optional(),
  isClientVisible: z.boolean().optional(),
  reviewDueAt: z.coerce.date().optional(),
});

export const updateArticleSchema = createArticleSchema.partial();

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
