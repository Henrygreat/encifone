# Testing & Acceptance — EncifOne

## 1. Principle

A feature is not complete unless its interface, backend, database, permissions, error handling, and tests are all implemented — per `CLAUDE.md`. Acceptance criteria are defined per phase in `docs/MASTER_ROADMAP.md` before implementation starts, not retrofitted after.

## 2. Test layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest/Jest | Service-layer functions, money/date utilities, permission checks, scoring/health-score calculations |
| API integration | Vitest/Jest + test DB | Route-level request/response, auth/permission enforcement, webhook handling (signature + idempotency) |
| End-to-end | Playwright | Full user journeys (the 20-step vertical slice is the canonical E2E scenario), portal flows, responsive breakpoints |
| Tenant isolation | Dedicated suite | Attempt cross-org read/write across every module via the API with a valid session for a *different* org — must fail |
| Permission | Dedicated suite | Each role against a matrix of actions; custom role + resource-level grants |
| Authentication | Integration | Password, passwordless, OAuth, MFA enrolment/challenge, session rotation on org switch |
| Financial calculation | Unit | Minor-unit/Decimal arithmetic across currencies, rounding edge cases, invoice/payment reconciliation totals |
| Payment webhook | Integration | Signature verification, replay/idempotency, failure/retry handling (Stripe/GoCardless test fixtures) |
| Workflow execution | Integration | Trigger → condition → action chains, retries, cycle limits, dry-run mode (once automation module exists) |
| AI tool permission | Integration | Agent attempting a tool outside its allowlist is rejected; autonomy-level gating enforced regardless of model output |
| Prompt injection | Scenario-based | Seeded malicious content in retrieved documents/emails attempting to trigger unauthorised tool calls — must be ignored |
| Accessibility | axe + manual | WCAG 2.1 AA checks on core app shell, dashboard, forms, portal |
| Responsive | Playwright viewport matrix | Mobile breakpoints for client portal in particular |
| Backup & restore | Scheduled drill | Restore a backup into a scratch environment and verify integrity, on a periodic cadence |

## 3. Per-phase acceptance

Each phase in `docs/MASTER_ROADMAP.md` lists concrete acceptance criteria tied to the vertical-slice journey. A phase is not marked done in `docs/IMPLEMENTATION_STATUS.md` until its criteria pass in CI (or, for manual categories like accessibility/backup drills, are explicitly logged as checked).

## 4. What "done" requires, every time

1. Lint clean.
2. Typecheck clean (strict mode).
3. Relevant unit + integration tests written and passing.
4. Migration created and applied cleanly on a fresh DB.
5. Security review for the change (tenant scoping, authz, secrets) — at minimum a self-check against `docs/SECURITY.md`.
6. Build succeeds.
7. Manual UI pass for any user-facing change (golden path + at least one edge case).
8. `docs/IMPLEMENTATION_STATUS.md` updated.
