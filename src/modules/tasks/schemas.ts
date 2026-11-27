import { TaskPriority, TaskStatus } from "@prisma/client";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listTasksQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  projectId: z.string().cuid().optional(),
  assignedToMe: z.coerce.boolean().optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  approvalRequired: z.boolean().optional(),
  assigneeIds: z.array(z.string().cuid()).default([]),
  labels: z.array(z.string().trim().min(1).max(40)).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  actualMinutes: z.number().int().min(0).optional(),
  blockedReason: z.string().trim().max(2000).optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
