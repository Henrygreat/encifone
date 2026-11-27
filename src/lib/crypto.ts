import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Symmetric encryption for secrets stored at rest (today: a per-org AI
 * provider API key, AIOrganisationConfig.encryptedApiKey) — no new secret
 * to configure; the key is derived from the already-required AUTH_SECRET.
 * AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than silently returning garbage.
 */
const ALGORITHM = "aes-256-gcm";

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(env.AUTH_SECRET).digest();
}

/** Returns `iv:authTag:ciphertext`, each hex-encoded — a single string
 * safe to store in one text column. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

export class SecretDecryptionError extends Error {
  constructor(message = "Could not decrypt this secret.") {
    super(message);
    this.name = "SecretDecryptionError";
  }
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new SecretDecryptionError("Malformed encrypted value.");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new SecretDecryptionError();
  }
}
