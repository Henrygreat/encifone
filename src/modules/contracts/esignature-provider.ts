import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * No real e-signature vendor is named anywhere in this project (see
 * .env.example's "ESIGNATURE_API_KEY — vendor TBD"). This abstraction is
 * written so that decision, whenever it's made, is a new class
 * implementing `ESignatureProvider` plus a new `ESignatureProviderType`
 * enum value — never a reshaping of the Contract/SignatureRequest schema
 * or the service layer that calls it.
 *
 * `MockESignatureProvider` is the only implementation today. It never
 * makes a network call to anything — the "signing experience" is this
 * application's own public contract page (src/app/contract/[token]/page.tsx),
 * the same pattern already used for public proposals. The webhook surface
 * below exists to exercise the security properties a REAL vendor's webhook
 * delivery would need (HMAC-style signature verification, idempotent
 * processing) using a self-consistent signing scheme, honestly presented
 * as internal/mock rather than a claimed vendor integration
 * (CLAUDE.md: "Don't claim an integration works until it's been exercised
 * against that provider's sandbox").
 */
export interface ESignatureWebhookEvent {
  externalEventId: string;
  type: "signed" | "declined";
  providerRequestId: string;
  signedName?: string;
  signedIpAddress?: string;
}

export interface ESignatureProvider {
  readonly type: "MOCK";
  createSignatureRequest(): { providerRequestId: string };
  /** Throws if the signature is invalid or the payload is malformed —
   * never returns a partially-trusted result. */
  verifyAndParseWebhook(rawBody: string, signatureHeader: string | null): ESignatureWebhookEvent;
  /** For tests and the mock provider's own internal "send a webhook"
   * simulation — signs a payload the same way verifyAndParseWebhook expects. */
  signPayloadForTesting(payload: Record<string, unknown>): { body: string; signature: string };
}

class InvalidWebhookSignatureError extends Error {
  constructor(message = "Webhook signature verification failed.") {
    super(message);
    this.name = "InvalidWebhookSignatureError";
  }
}

/** HMAC-SHA256 over the raw request body, using AUTH_SECRET as the shared
 * key — this is an internal/mock scheme (no external vendor to configure a
 * secret with), not Stripe's or any real vendor's actual signing scheme. */
function sign(rawBody: string): string {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(rawBody).digest("hex");
}

export class MockESignatureProvider implements ESignatureProvider {
  readonly type = "MOCK" as const;

  createSignatureRequest(): { providerRequestId: string } {
    return { providerRequestId: `mock_${crypto.randomBytes(16).toString("hex")}` };
  }

  verifyAndParseWebhook(rawBody: string, signatureHeader: string | null): ESignatureWebhookEvent {
    if (!signatureHeader) {
      throw new InvalidWebhookSignatureError("Missing signature header.");
    }
    const expected = sign(rawBody);
    const provided = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
      throw new InvalidWebhookSignatureError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new InvalidWebhookSignatureError("Malformed webhook payload.");
    }
    const body = parsed as Record<string, unknown>;
    if (
      typeof body.externalEventId !== "string" ||
      (body.type !== "signed" && body.type !== "declined") ||
      typeof body.providerRequestId !== "string"
    ) {
      throw new InvalidWebhookSignatureError("Malformed webhook payload.");
    }

    return {
      externalEventId: body.externalEventId,
      type: body.type,
      providerRequestId: body.providerRequestId,
      signedName: typeof body.signedName === "string" ? body.signedName : undefined,
      signedIpAddress: typeof body.signedIpAddress === "string" ? body.signedIpAddress : undefined,
    };
  }

  signPayloadForTesting(payload: Record<string, unknown>): { body: string; signature: string } {
    const body = JSON.stringify(payload);
    return { body, signature: sign(body) };
  }
}

export function getESignatureProvider(): ESignatureProvider {
  return new MockESignatureProvider();
}

export { InvalidWebhookSignatureError };
