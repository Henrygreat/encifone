# Phase 4.1 financial documents and online invoices

## Delivered scope

- Four isolated A4 layouts render invoices, estimates, receipts, credit notes, customer statements and draft proformas. PDFKit embeds the distributed Inter and Source Serif 4 Latin fonts and keeps text selectable. Line items wrap and table headings repeat on continuation pages.
- **Invoices → Finance & Billing settings** configures layouts, seller identity, tax and registration details, logo, colours, fonts, numbering, default terms, bank instructions, notes, footer, online card payments and optional QR codes. Sample PDFs are labelled as samples.
- Issuing a new invoice or sharing an estimate snapshots its organisation and customer document data. Receipts and credit notes use the associated invoice snapshot. Historic invoices and estimates that pre-date snapshots still render using currently saved identity information because the historic branding was never stored. Account statements are live base-currency balance reports.
- The invoice detail page supports an inline PDF preview, print through the PDF viewer, download, payment history, receipt and credit-note downloads, manual payment, credit notes, and guarded voiding. An issued invoice can generate a signed sharing link valid for 1–90 days. Regeneration or revocation invalidates the previous link. Rotating `AUTH_SECRET` also invalidates existing links. An already opened Stripe checkout expires independently.
- Stripe Express onboarding and direct Checkout charges route card collections to each organisation’s connected account. The reserved invoice balance prevents parallel manual allocation or credit during checkout. Verified Checkout and refund events update the existing payment ledger and invoice balance with transaction-scoped deduplication. The staff action refunds the remaining payment, and reconciliation also accepts successful partial provider refunds.
- Resend can send a secure invoice link or payment reminder to the saved billing email. The UI reports provider acceptance. Delivery tracking and automatic reminder schedules are outside this workflow.

## Local verification

- Prisma validation and client generation passed. All five Phase 4.1 migrations applied to the local PostgreSQL 18 validation database. Prisma found no schema drift.
- TypeScript and the production standalone build passed. ESLint reported zero errors and two pre-existing React Compiler warnings. Compose configuration validated.
- 125 Vitest tests passed across 21 files. Coverage includes all six document kinds, font embedding, multi-page layouts, PDF links and QR images, immutable branding, tenant isolation, link regeneration and expiry, signed webhook verification and currency conversion, same-invoice payment reservation, duplicate settlement, and partial and full refunds.
- Four Chromium workflows passed on the standalone build. They covered the existing staff and portal finance workflows plus settings, logo upload, branded sample PDF, mobile public invoice, PDF download and revocation.

## Runtime configuration

1. Apply the additive migrations with the existing one-shot Compose migration service. There are five Phase 4.1 migrations for snapshots, signed links, Checkout attempts, document references and refund reconciliation.
2. Set a canonical HTTPS `APP_URL` and stable `AUTH_SECRET` for the deployed application.
3. In staging, configure `STRIPE_CONNECT_SECRET_KEY` and `STRIPE_CONNECT_WEBHOOK_SECRET` for the Connect platform and its **connected account** webhook endpoint at `/api/v1/webhooks/stripe-connect-invoices`. Subscribe to `checkout.session.completed`, `checkout.session.expired`, `refund.created`, and `refund.updated`. The earlier CRM deposit keys and webhook continue to serve the separate CRM workflow.
4. Connect a test merchant through Finance & Billing, complete Stripe onboarding, enable Pay Now, issue and share an invoice, and verify checkout, capture, duplicate webhook replay, and refunds against Stripe test mode. Keep live keys unset until this passes.
5. For invoice email, set `RESEND_API_KEY` and `FINANCE_EMAIL_FROM` to a verified Resend sender. Verify send, resend and reminder delivery to a test mailbox and confirm access after link revocation. Provider-backed Stripe and Resend checks require externally configured accounts.

PayPal, GoCardless, Paystack and Flutterwave have no active adapters. Stripe disputes, full multilingual font fallback, and restoring historical branding for legacy documents remain open. No production data or provider accounts were changed.

Provider references. [Stripe direct charges](https://docs.stripe.com/connect/direct-charges), [Stripe Connect webhooks](https://docs.stripe.com/connect/webhooks), [Stripe currency units](https://docs.stripe.com/currencies#special-cases), [Resend send email API](https://resend.com/docs/api-reference/emails/send-email).
