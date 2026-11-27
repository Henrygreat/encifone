import { TeamMemberClassification } from "@prisma/client";
import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(4000).optional(),
});

export const createTeamSchema = z.object({
  departmentId: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(4000).optional(),
});

export const updateMembershipProfileSchema = z.object({
  classification: z.nativeEnum(TeamMemberClassification).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).optional(),
  weeklyCapacityHours: z.number().int().min(1).max(168).optional(),
});

export const assignTeamMemberSchema = z.object({
  membershipId: z.string().cuid(),
});

export const createTimeEntrySchema = z.object({
  taskId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  workDate: z.coerce.date(),
  minutes: z.number().int().min(1).max(1440),
  isBillable: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const approveTimeEntrySchema = z.object({
  approve: z.boolean(),
});
