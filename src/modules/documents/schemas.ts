import { z } from "zod";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

export const requestUploadSchema = z.object({
  originalFilename: z.string().min(1).max(260),
  mimeType: z.enum(ALLOWED_MIME_TYPES as [string, ...string[]]),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  category: z.string().max(100).optional(),
  onboardingStepId: z.string().min(1).optional(),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const confirmUploadSchema = z.object({
  documentId: z.string().min(1),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const reviewDocumentSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
