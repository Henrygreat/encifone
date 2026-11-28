import Stripe from "stripe";

export interface InvoiceCheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  paid: boolean;
  amountMinor: number | null;
  currency: string | null;
  paymentId: string | null;
  attemptId?: string;
}

export interface InvoicePaymentGateway {
  createMerchant(key: string): Promise<string>;
  onboardingUrl(account: string, returnUrl: string): Promise<string>;
  capabilities(account: string): Promise<{ checkout: boolean }>;
  createCheckout(input: {
    account: string;
    attemptId: string;
    amountMinor: number;
    currency: string;
    expiresAt: Date;
    returnUrl: string;
  }): Promise<InvoiceCheckoutSession>;
  retrieveCheckout(
    account: string,
    session: string,
  ): Promise<InvoiceCheckoutSession>;
  verifyCheckoutEvent(
    raw: string,
    signature: string,
  ): { account: string; session: InvoiceCheckoutSession } | null;
  refund(
    account: string,
    paymentId: string,
    amountMinor: number,
    currency: string,
    key: string,
  ): Promise<InvoiceRefund>;
  verifyRefundEvent(
    raw: string,
    signature: string,
  ): { account: string; refund: InvoiceRefund } | null;
}

export interface InvoiceRefund {
  id: string;
  paymentId: string | null;
  amountMinor: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
}

// Stripe represents ISK and UGX using two API decimal places even though the ledger uses whole units.
function stripeUnitFactor(currency: string | null) {
  const code = currency?.toUpperCase();
  return code === "ISK" || code === "UGX" ? 100 : 1;
}

function mapRefund(refund: Stripe.Refund): InvoiceRefund {
  return {
    id: refund.id,
    amountMinor: refund.amount / stripeUnitFactor(refund.currency),
    currency: refund.currency.toUpperCase(),
    paymentId:
      typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : (refund.payment_intent?.id ?? null),
    status:
      refund.status === "succeeded"
        ? "succeeded"
        : refund.status === "pending" || refund.status === "requires_action"
          ? "pending"
          : "failed",
  };
}

function checkoutSession(
  session: Stripe.Checkout.Session,
): InvoiceCheckoutSession {
  return {
    id: session.id,
    url: session.url,
    status:
      session.status === "open"
        ? "open"
        : session.status === "complete"
          ? "complete"
          : session.status === "expired"
            ? "expired"
            : null,
    paid: session.payment_status === "paid",
    amountMinor: session.amount_total === null ? null : session.amount_total / stripeUnitFactor(session.currency),
    currency: session.currency?.toUpperCase() ?? null,
    paymentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    attemptId: session.metadata?.encifoneInvoiceAttempt,
  };
}

export function invoiceGatewayConfigured() {
  return Boolean(
    process.env.STRIPE_CONNECT_SECRET_KEY &&
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  );
}

export function getInvoicePaymentGateway(): InvoicePaymentGateway {
  const key = process.env.STRIPE_CONNECT_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!key || !webhookSecret)
    throw new Error("Online payments are unavailable.");
  const stripe = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
  return {
    async createMerchant(idempotencyKey) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        },
        { idempotencyKey },
      );
      return account.id;
    },
    async onboardingUrl(account, returnUrl) {
      const link = await stripe.accountLinks.create({
        account,
        return_url: returnUrl,
        refresh_url: returnUrl,
        type: "account_onboarding",
      });
      return link.url;
    },
    async capabilities(account) {
      const connected = await stripe.accounts.retrieve(account);
      return {
        checkout:
          connected.charges_enabled &&
          connected.capabilities?.card_payments === "active",
      };
    },
    async createCheckout(input) {
      return checkoutSession(
        await stripe.checkout.sessions.create(
          {
            mode: "payment",
            allowed_payment_method_types: ["card"],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: input.currency.toLowerCase(),
                  unit_amount: input.amountMinor * stripeUnitFactor(input.currency),
                  product_data: { name: "Invoice balance" },
                },
              },
            ],
            adaptive_pricing: { enabled: false },
            expires_at: Math.floor(input.expiresAt.getTime() / 1000),
            success_url: input.returnUrl,
            cancel_url: input.returnUrl,
            metadata: { encifoneInvoiceAttempt: input.attemptId },
          },
          {
            stripeAccount: input.account,
            idempotencyKey: `encifone-invoice-${input.attemptId}`,
          },
        ),
      );
    },
    async retrieveCheckout(account, session) {
      return checkoutSession(
        await stripe.checkout.sessions.retrieve(
          session,
          {},
          { stripeAccount: account },
        ),
      );
    },
    verifyCheckoutEvent(raw, signature) {
      const event = stripe.webhooks.constructEvent(
        raw,
        signature,
        webhookSecret,
      );
      if (
        !event.account ||
        !["checkout.session.completed", "checkout.session.expired"].includes(
          event.type,
        )
      )
        return null;
      const session = checkoutSession(
        event.data.object as Stripe.Checkout.Session,
      );
      return session.attemptId ? { account: event.account, session } : null;
    },
    async refund(account, paymentId, amountMinor, currency, idempotencyKey) {
      return mapRefund(
        await stripe.refunds.create(
          { payment_intent: paymentId, amount: amountMinor * stripeUnitFactor(currency) },
          { stripeAccount: account, idempotencyKey },
        ),
      );
    },
    verifyRefundEvent(raw, signature) {
      const event = stripe.webhooks.constructEvent(
        raw,
        signature,
        webhookSecret,
      );
      if (
        !event.account ||
        !["refund.created", "refund.updated"].includes(event.type)
      )
        return null;
      return {
        account: event.account,
        refund: mapRefund(event.data.object as Stripe.Refund),
      };
    },
  };
}
