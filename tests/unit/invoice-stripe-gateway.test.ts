import Stripe from "stripe";
import { afterEach, expect, it, vi } from "vitest";
import { getInvoicePaymentGateway } from "@/modules/payments/invoice-payment-gateway";

afterEach(() => vi.unstubAllEnvs());

it.each([["gbp", 9876], ["isk", 987600], ["ugx", 987600]] as const)("verifies a signed Connect event in %s and rejects an altered payload", (currency, amount) => {
  const secret = "whsec_local_invoice_test";
  vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_local_invoice_test");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", secret);
  const event = JSON.stringify({
    type: "checkout.session.completed", account: "acct_test", data: { object: {
      id: "cs_test", status: "complete", payment_status: "paid", amount_total: amount,
      currency, payment_intent: "pi_test", metadata: { encifoneInvoiceAttempt: "attempt_test" },
    } },
  });
  const stripe = new Stripe("sk_test_local_invoice_test");
  const header = stripe.webhooks.generateTestHeaderString({ payload: event, secret });
  const gateway = getInvoicePaymentGateway();
  expect(gateway.verifyCheckoutEvent(event, header)).toMatchObject({
    account: "acct_test", session: { attemptId: "attempt_test", paid: true, amountMinor: 9876, currency: currency.toUpperCase() },
  });
  expect(() => gateway.verifyCheckoutEvent(event.replace(String(amount), "1000"), header)).toThrow();
});
