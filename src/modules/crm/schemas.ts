import { z } from "zod";
import { CompanyStatus, ContactStatus } from "@prisma/client";

export const contactEmailSchema = z.object({
  address: z.string().email(),
  label: z.string().max(40).optional(),
  isPrimary: z.boolean().optional(),
});

export const contactPhoneSchema = z.object({
  number: z.string().min(1).max(40),
  label: z.string().max(40).optional(),
  isPrimary: z.boolean().optional(),
});

const tagsSchema = z.array(z.string().min(1).max(60)).max(30);

export const createContactSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  jobTitle: z.string().max(160).optional(),
  department: z.string().max(160).optional(),
  emails: z.array(contactEmailSchema).max(10).optional(),
  phones: z.array(contactPhoneSchema).max(10).optional(),
  preferredChannel: z.string().max(40).optional(),
  companyId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  status: z.nativeEnum(ContactStatus).optional(),
  leadSource: z.string().max(120).optional(),
  marketingConsent: z.boolean().optional(),
  tags: tagsSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial();
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const listContactsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.nativeEnum(ContactStatus).optional(),
  companyId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  tag: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "updatedAt", "firstName", "lastName"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  tradingName: z.string().max(200).optional(),
  registrationNumber: z.string().max(80).optional(),
  industry: z.string().max(120).optional(),
  companySize: z.string().max(60).optional(),
  website: z.string().url().max(300).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  country: z.string().max(80).optional(),
  currency: z.string().length(3).optional(),
  ownerId: z.string().min(1).optional(),
  status: z.nativeEnum(CompanyStatus).optional(),
  parentCompanyId: z.string().min(1).optional(),
  tags: tagsSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const listCompaniesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.nativeEnum(CompanyStatus).optional(),
  ownerId: z.string().min(1).optional(),
  tag: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
