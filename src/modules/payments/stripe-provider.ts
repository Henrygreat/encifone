import Stripe from "stripe";

/**
 * Stripe is explicitly named in docs/ARCHITECTURE.md's stack list, unlike
 * the e-signature vendor — this is a real integration, not a mock, but it
 * is OPTIONAL: STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are absent in a
 * default local/CI environment (.env.example), and every function here
 * must behave correctly in that state rather than crash the app at import
 * time — same pattern as src/lib/auth.ts's conditional Google OAuth
 * provider registration.
 */
export class StripeNotConfiguredError extends Error {
  constructor(message = "Stripe is not configured for this environment.") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

let cachedClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new StripeNotConfiguredError();
  }
  if (!cachedClient) {
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cachedClient;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function createPaymentIntent(input: {
  amountMinor: number;
  currency: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ providerPaymentId: string; clientSecret: string | null }> {
  const stripe = getStripeClient();
  // The idempotency key is sent as a request option, not a body field —
  // Stripe itself dedupes a retried request with the same key within its
  // standard 24-hour window, returning the original PaymentIntent instead
  // of creating a second one.
  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      metadata: input.metadata,
    },
    { idempotencyKey: input.idempotencyKey }
  );
  return { providerPaymentId: intent.id, clientSecret: intent.client_secret };
}

/** Throws if the signature is invalid — Stripe's own SDK verification,
 * never a hand-rolled HMAC check for a real vendor's webhook. */
export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header.");
  }
  // Constructing a client without a secret key only for signature
  // verification is intentional — Stripe.webhooks.constructEvent doesn't
  // need API credentials, only the webhook secret, so this still works in
  // an environment that has STRIPE_WEBHOOK_SECRET but not
  // STRIPE_SECRET_KEY (e.g. a webhook-only worker).
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_unused_for_verification");
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET);
}
