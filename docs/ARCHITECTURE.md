# Architecture — EncifOne

## 1. Architectural style

**Modular monolith + independent background workers.** One Next.js application (App Router) serving the marketing site, the authenticated app, and client portals from the same codebase but logically separated route groups; one PostgreSQL database with strict schema-level domain boundaries; Redis-backed queues (BullMQ) for anything asynchronous (emails, AI agent runs, webhook delivery, report generation, integration sync).

**Why not microservices now:** at MVP and early-growth scale, microservices add deployment/observability overhead with no corresponding benefit — the team is small, the domain boundaries are still settling, and a modular monolith with clean internal module boundaries can be split into services later *if* a specific module (e.g. AI agent execution, or webhook ingestion) outgrows the monolith's scaling profile. Avoid Kubernetes until there's a concrete scaling trigger (see §7).

## 2. High-level diagram (textual)

```
                         ┌─────────────────────────┐
  Browser / Portal  ───▶ │  Next.js App (App Router)│──▶ PostgreSQL (Prisma)
  (marketing, app,       │  - UI (RSC + client)      │       │
   client portal)        │  - API routes (REST)      │       ├─▶ pgvector (RAG)
                         │  - Service layer (authz)  │──▶ Redis (cache, queue, rate-limit)
                         │  - AI Gateway             │       │
                         └───────────┬───────────────┘       ▼
                                     │                  BullMQ Workers
                                     ▼                  - AI agent execution
                           S3-compatible storage         - webhook delivery/retry
                           (documents, attachments)      - scheduled jobs (SLA timers,
                                     │                      renewals, reports)
                                     ▼                      - integration sync
                           External integrations:
                           Stripe/GoCardless/PayPal, Xero/QuickBooks,
                           Gmail/Outlook, WhatsApp/Twilio, Zoom/Teams,
                           Anthropic/OpenAI/Gemini/OpenRouter
```

## 3. Module boundaries

Domain modules (own their Prisma models, service functions, API routes, and UI — see `CLAUDE.md`):

| Module | Owns |
|---|---|
| `platform` | Super admin, orgs, subscription plans, feature flags, usage metering |
| `identity` | Users, memberships, roles/permissions, auth, org switching |
| `crm` | Leads, contacts, companies, custom fields/objects, lead scoring |
| `sales` | Pipelines, opportunities, proposals, contracts, e-signature |
| `clients` | Client 360, AI client memory, client journey engine, health scores |
| `onboarding` | Onboarding flows, forms, checklists |
| `portal` | White-label client portal rendering + portal-scoped API |
| `projects` | Projects, milestones, tasks, dependencies, time tracking, change requests |
| `catalogue` | Service catalogue, packages, entitlements, checkout |
| `helpdesk` | Tickets, SLAs, routing, canned responses |
| `inbox` | Universal inbox, channel connectors, message threading |
| `scheduling` | Booking pages, availability, meeting integrations |
| `finance` | Estimates, invoices, payments, expenses, retainers, reconciliation |
| `profitability` | Cost allocation, client profitability, leakage/scope-creep detection |
| `success` | Health scores, NPS, churn, renewals, promise tracker |
| `assets` | Client asset & renewal tracking |
| `ai-agents` | Agent configs, execution, approvals, usage/cost tracking |
| `ai-gateway` | Provider-agnostic model routing, streaming, structured output, fallback |
| `automation` | Visual workflow builder, triggers, executions |
| `knowledge` | Knowledge base, embeddings, RAG retrieval |
| `marketing` | Forms, landing pages, campaigns, consent/suppression |
| `team` | Team profiles, schedules, timesheets, resourcing |
| `integrations` | OAuth connections, webhooks, sync jobs, public API |
| `reporting` | BI, forecasting, dashboards, client reviews/ROI |

Cross-cutting shared libs: `auth`, `tenancy` (org-scoping middleware/helpers), `permissions` (RBAC engine), `money` (Decimal/minor-unit helpers), `audit` (immutable logging), `storage` (S3 wrapper + signed URLs), `ui` (design system components).

## 4. Multi-tenancy implementation

- Every tenant-owned table has a non-nullable `organisationId` with an FK to `Organisation` and a composite index `(organisationId, id)` plus domain-appropriate composite indexes (e.g. `(organisationId, status)`).
- All reads/writes go through service-layer functions that derive `organisationId` from the authenticated session's **active membership**, never from a request parameter or body field. Any API input containing an `organisationId` is ignored/validated-against, never trusted as the scoping key.
- Postgres Row-Level Security is evaluated as a defence-in-depth layer for Phase 2+ once the service-layer pattern is proven; MVP relies on consistent service-layer scoping plus repo-wide lint/test coverage for "every query is scoped" (see `docs/TESTING.md`).
- File storage: object keys are namespaced `org/{organisationId}/...`; signed URLs are generated per-request and scoped to the requesting session's org.
- AI retrieval (RAG): vector search queries always filter by `organisationId` at the SQL level, not post-filtered in application code.
- Background jobs carry `organisationId` in their payload and re-validate entitlements/permissions at execution time (a job enqueued under old entitlements must not execute under stale permissions).

## 5. API architecture

- REST under `/api/v1/*`, documented via OpenAPI (generated from route schemas, Zod-validated request/response shapes).
- Portal API is a distinct, narrower surface (`/api/portal/v1/*`) with its own session type that structurally cannot touch internal-only tables (enforced by using a separate, intentionally limited set of service functions, not just a permission check).
- Webhooks: outbound (to customer-registered endpoints) are HMAC-signed, retried with backoff, logged; inbound (from Stripe, WhatsApp, etc.) are verified then processed idempotently via a dedupe key.
- Real-time: SSE for AI streaming responses and notification feeds; WebSocket (or SSE fallback) for inbox/live collaboration where polling is insufficient.
- Public API (Phase 2+) is the same internal API surface, gated by API keys with scoped permissions and rate limiting (Redis token bucket).

## 6. AI infrastructure

See `docs/AI_ARCHITECTURE.md` for the full design. Summary: a single `ai-gateway` module abstracts Anthropic/OpenAI/Gemini/OpenRouter/local behind one interface (model routing, streaming, structured output, fallback, token accounting); all agents and AI features call this gateway, never a provider SDK directly.

## 7. Infrastructure & deployment

- Docker Compose for local dev and small production deploys (app, Postgres, Redis, worker, optional local model runner).
- Coolify-compatible: standard Dockerfile + compose, no platform-specific lock-in.
- Reverse proxy via Traefik or Nginx; Cloudflare in front for DNS/CDN/WAF.
- CI/CD via GitHub Actions: lint → typecheck → test → build → migrate (on deploy) → deploy.
- Health checks (`/api/health`) covering DB, Redis, and queue connectivity; structured JSON logging; error monitoring via Sentry-compatible SDK.
- Scaling path: stateless app containers behind the proxy scale horizontally first; Postgres read replicas and a dedicated worker fleet come next; only split out a service (e.g. AI agent execution) if its resource profile genuinely diverges from the app tier. Kubernetes is deferred until multi-region or very high scale needs justify the operational cost.
- Target initial footprint: runs on a single 4–8 vCPU / 8–16GB VPS for early customers (see `docs/ROADMAP.md` §Infra costs).

## 8. Key architectural risks & mitigations

| Risk | Mitigation |
|---|---|
| Tenant data leakage via a missed scoping check | Centralised service-layer helpers that *require* an org context parameter (no "unscoped" query helper exists); automated tenant-isolation tests (`docs/TESTING.md`) |
| AI agent takes an unintended destructive/financial action | Autonomy-level model + approval gating + spend limits + emergency stop, enforced in `ai-agents`, not left to prompt instructions alone |
| Vendor lock-in to one AI provider | `ai-gateway` abstraction from day one; no direct provider SDK calls outside it |
| Modular monolith becomes an unmanageable "big ball of mud" | Enforced module boundaries (lint rule: no cross-module deep imports, only public module interfaces), documented in `CLAUDE.md` |
| Financial rounding errors | Mandatory money utilities (Decimal/minor-units), tested against known edge cases (`docs/TESTING.md`) |
