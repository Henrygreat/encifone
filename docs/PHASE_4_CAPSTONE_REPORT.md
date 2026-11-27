# EncifOne Phase 4 Capstone Report

_2026-11-27_

## Takeover

The takeover began on `feature/phase-4-complete-implementation` at `1a02f63473cbe1ed88c1f05a6b59b02bffb4fbf9`, with uncommitted finance schema, migration, permissions, service, API and list-page work. Phase 3 already supplied projects, tasks, service requests, time approval, portal sessions and background jobs. Phase 4 connects those foundations to the work-to-invoice and payment-reconciliation goals and delivers the owner-approved operational finance extension.

## Delivered workflows

| Area | Delivered |
| --- | --- |
| Estimates and quotations | Drafts with versioned price snapshots, duplication, portal sharing, expiry checks, acceptance and idempotent conversion to an invoice draft. |
| Invoices | Manual drafts and drafts linked to approved billable time or resolved service requests. Organisation-specific invoice numbers on issuance, draft archival, PDF, partial and full settlement, credit notes and due-date reporting. |
| Payments | External payment references and same-currency allocation to an invoice. Retries return the existing payment. Credits reduce the open balance while preserving the issued invoice total. |
| Expenses | Capture supplier costs, edit submitted expenses, approve or reject, and mark an approved expense reimbursed. Client, project, billable and recurring fields are available through the API. Approved recurring expenses contribute to forecasts. |
| Subscriptions | Billing intervals and trials, pause, resume, cancel and API-based upgrades and downgrades. Due periods generate draft invoices through BullMQ or the authorised manual run. |
| Retainers | Usage, incremental overage and scheduled allowance reset. Configured renewals generate drafts for fees and prior-period overages. |
| Reports and forecasts | Base-currency billed revenue net of credits, recorded collections, approved expenses, operating surplus and margin, receivables ageing, scenario forecasts and subscription-normalised MRR. |
| Dashboard and portal | Existing Bento layout displays MRR and links to finance workflows. The portal shows shared estimates, acceptance, issued invoices and PDF downloads, subscriptions and retainer usage. |
| Audit | Finance mutations append actor, resource and action metadata to the existing audit log. The reporting page shows the latest finance events. |

## Security and financial integrity

- Internal handlers obtain the active organisation from verified membership and enforce finance view or manage capabilities. Finance writes validate supplied related records within that organisation. Portal handlers scope by organisation and client from the authenticated portal session, with explicit response fields.
- Portal tests rejected wrong-client requests and excluded draft invoices, internal notes and payment allocations. Portal estimate acceptance records the portal principal.
- Amounts use bounded integer minor units. Tax is rounded per line. MRR and percentage-based forecasts use decimal arithmetic. Reports filter to the organisation’s base currency because there are no configured exchange rates.
- Organisation-scoped transactions serialise invoice numbering, estimate conversion, payments, credits and billing periods. Database uniqueness protects source invoices, creation keys and payment references. Critical writes and their audit entries commit together.
- Payments in a different currency or above the open balance are rejected. Recurring billing creates drafts without initiating fund collection. Finance responses sanitise Prisma errors.

## Validation

| Check | Result |
| --- | --- |
| Prisma | Schema validation and generation passed with Prisma 7.10.1. All 16 migrations applied on a fresh local PostgreSQL 18 + pgvector database named `encifone_phase4_validation`. Prisma reported no schema drift. |
| TypeScript and ESLint | TypeScript passed. ESLint reported zero errors and two existing React Compiler warnings in onboarding templates and the activity timeline. |
| Vitest | 116 tests passed in 19 files. Finance integration covered wrong-tenant references and reads, portal filtering and acceptance, wrong-role issuance, exact GBP and JPY settlement, concurrent payment retries, approved time, recurring invoice deduplication, MRR currency filtering, credits and retainer renewal. |
| Production build | Next.js and the Docker app and worker builds passed. Docker reported a scanner warning for the public build-placeholder `AUTH_SECRET` and connection attempts to the placeholder Redis address during the build. |
| Docker runtime | Compose config validated. The standalone app readiness endpoint returned HTTP 200. The worker reached healthy status, registered the billing schedule and completed its billing job on an isolated Redis logical database. |
| Browser | Two Chromium workflows passed against the standalone Docker app. The staff flow tested sign-in, draft creation, issuance, payment reconciliation, all three dashboard themes and mobile payment at 390 px. The portal flow tested invited sign-in, estimate acceptance, draft exclusion, PDF download and wrong-client PDF denial. |

## Migrations

1. `20261127214240_phase4_finance_foundation` preserves the takeover tables for estimates, invoice lines and allocations, credit notes, expenses, subscriptions, retainers and their associated records. It extends the existing Payment model.
2. `20261127223000_phase4_finance_integrity` adds the manual payment provider enum value.
3. `20261127223100_phase4_invoice_sources` adds nullable work source IDs and creation keys with organisation-scoped uniqueness.

## Environment and release readiness

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | App, worker and migration connection. Apply migrations before starting the updated app and worker. |
| `REDIS_URL` | App Redis and shared BullMQ queue for recurring billing. |
| `AUTH_SECRET` | Existing session secret, required by the shared app and worker environment loader. |
| `APP_URL`, `NEXTAUTH_URL` | Public app and auth URLs. `NEXTAUTH_URL` defaults to `APP_URL`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional for the existing Stripe deposit flow. |

The operational finance workflow requires no new environment variables. The branch is locally validated for review and staging. An existing-data upgrade rehearsal, provider settlement verification and release approval remain open. The tested workflow reconciles externally received payments by reference. In-portal checkout, automatic bank matching and payout reconciliation remain outside the delivered workflow. Statutory accounts, currency conversion, accounting sync and the deeper labour-cost and revenue-leakage engine remain outside the operational release. A breakpoint sweep of every finance page remains open.

## Git and next phase

- `42268707704f5b56ebc77c20800e8b02a2081e60` contains the implementation, migrations and tests.
- The subsequent validation commit adds the portal browser workflow and contains this capstone, roadmap and implementation status.
- GitHub, master, Coolify and the production database were left untouched.

After staging verification, proceed to Phase 5’s real KPI drill-downs, read-only AI Command Centre and audit coverage for the full MVP journey.
