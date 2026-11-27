import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible object storage — explicitly named in docs/ARCHITECTURE.md's
 * stack ("S3-compatible storage", "object keys namespaced org/{organisationId}/...,
 * signed URLs generated per-request"), not a new undocumented dependency.
 * OPTIONAL in a default local/CI environment (S3_* absent in .env.example),
 * same conditional pattern as src/modules/payments/stripe-provider.ts and
 * src/lib/auth.ts's Google OAuth registration — every function here must
 * behave correctly when unconfigured, never crash the app at import time.
 *
 * Private by design: this project never serves a document from a public
 * bucket URL (CLAUDE.md §11 / brief §11 — "never expose private client
 * documents through public storage URLs"). Every read/write goes through a
 * short-lived, permission-checked signed URL minted on demand by the
 * service layer, never a long-lived or public one.
 */
export class StorageNotConfiguredError extends Error {
  constructor(message = "File storage is not configured for this environment.") {
    super(message);
    this.name = "StorageNotConfiguredError";
  }
}

const SIGNED_URL_EXPIRY_SECONDS = 300;

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
  );
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new StorageNotConfiguredError();
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "auto",
      // S3-compatible providers other than AWS itself (R2, MinIO, DO
      // Spaces) generally require path-style addressing, not AWS's
      // virtual-hosted-style default.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

function bucket(): string {
  return process.env.S3_BUCKET!;
}

/** A safe, opaque object key — never derived from the caller-supplied
 * filename (which could contain path-traversal characters or collide),
 * only from server-generated ids. Namespaced per docs/ARCHITECTURE.md
 * §"storage" so a future per-tenant storage audit/export is a prefix
 * listing, not a table scan. */
export function buildDocumentStorageKey(organisationId: string, clientId: string, originalFilename: string): string {
  const extMatch = /\.[a-zA-Z0-9]{1,10}$/.exec(originalFilename);
  const ext = extMatch ? extMatch[0].toLowerCase() : "";
  return `org/${organisationId}/clients/${clientId}/documents/${randomUUID()}${ext}`;
}

/** A time-limited URL the caller's browser can PUT the file bytes to
 * directly — the app server itself never buffers the file body. */
export async function createUploadUrl(storageKey: string, mimeType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket(), Key: storageKey, ContentType: mimeType });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_EXPIRY_SECONDS });
}

/** A time-limited URL to download/view one object — minted fresh per
 * request after the caller's own permission check, never cached or
 * reused across requests/users. */
export async function createDownloadUrl(storageKey: string, downloadFilename?: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: storageKey,
    ...(downloadFilename && {
      ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/["\r\n]/g, "")}"`,
    }),
  });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_EXPIRY_SECONDS });
}

export async function deleteObject(storageKey: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey }));
}

/** Confirms the object actually exists (and, if given, roughly matches
 * the expected size) — never trust a client's bare say-so that an
 * upload finished before marking a ClientDocument's metadata row
 * confirmed. */
export async function objectExists(storageKey: string, expectedSizeBytes?: number): Promise<boolean> {
  try {
    const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: storageKey }));
    if (expectedSizeBytes != null && result.ContentLength != null) {
      return result.ContentLength === expectedSizeBytes;
    }
    return true;
  } catch (error) {
    if (error instanceof NotFound) return false;
    throw error;
  }
}
