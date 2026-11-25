# Security — Threat Model & Controls — EncifOne

## 1. Scope & approach

Threat model covers: multi-tenant data isolation, authentication/authorisation, payment/financial data handling, AI-specific risks, and standard web application risks (OWASP Top 10 + SSRF). Methodology: STRIDE per major trust boundary. This document informs implementation; it does not itself constitute a certification. Documentation here supports a future ISO 27001 / SOC 2 readiness effort — no certification is claimed.

## 2. Trust boundaries

1. Public internet ↔ Next.js app (unauthenticated marketing + login)
2. Authenticated user session ↔ app (internal staff users)
3. Client portal session ↔ app (external client users — more restricted)
4. App ↔ PostgreSQL / Redis / S3 (internal network boundary)
5. App ↔ third-party integrations (Stripe, Xero, WhatsApp, AI providers, etc.)
6. App/agents ↔ AI model providers (data leaving the trust boundary to a third party)
7. Background workers ↔ everything above (same risks, asynchronous context)

## 3. Tenant isolation (primary risk)

**Threat:** cross-tenant data disclosure or modification (Information Disclosure / Tampering).

**Controls:**
- `organisationId` is derived server-side from the authenticated session's active membership on every request; never accepted as a trusted client input for scoping purposes.
- All service-layer data access functions require an explicit org-context argument — there is no "global" query helper that can accidentally skip scoping.
- Portal sessions use a structurally separate, narrower service-function set (`docs/ARCHITECTURE.md` §5) that cannot reach internal-only tables (cost data, internal notes, AI agent configs) — isolation by construction, not by a conditional check.
- File storage keys are namespaced by org; signed URLs are short-lived and scoped to the requesting session.
- AI retrieval (RAG) queries are filtered by `organisationId` at the SQL/vector-query level.
- Background jobs carry and re-validate org context + current entitlements at execution time, not just at enqueue time.
- **Testing requirement:** dedicated tenant-isolation test suite (`docs/TESTING.md`) attempting cross-org reads/writes across every module before each release.

## 4. Authentication & session security

- Email/password (hashed with a modern adaptive algorithm), passwordless (magic link), Google OAuth, Microsoft OAuth, MFA (TOTP minimum; WebAuthn considered Phase 2).
- Secure, `HttpOnly`, `SameSite=Lax` (or `Strict` where compatible with OAuth flows) session cookies; session rotation on privilege change (role change, org switch, password reset).
- Rate limiting (Redis token bucket) on auth endpoints to resist credential stuffing/brute force.
- Session/device audit trail visible to the user (and org admins for their org).

## 5. Authorisation (RBAC)

- 14 baseline roles + custom roles + resource-level `PermissionGrant` overrides (`docs/DATABASE_SCHEMA.md` §2).
- Every API route declares required permission(s); enforcement happens in a shared middleware/decorator, not ad hoc per-route checks, to avoid an inconsistently-protected route.
- Client-portal users are a structurally distinct principal type, never a disguised internal role.

## 6. Application-layer controls (OWASP-aligned)

| Risk | Control |
|---|---|
| SQL injection | Prisma parameterised queries everywhere; no raw SQL string concatenation; any raw SQL (e.g. pgvector queries) uses parameter binding and is code-reviewed |
| XSS | React's default escaping; CSP with no `unsafe-inline` for scripts where feasible; sanitisation on any HTML stored from TipTap rich text before render |
| CSRF | SameSite cookies + CSRF token on state-changing form posts where cookie auth is used |
| SSRF | Outbound webhook/integration URLs validated against an allowlist pattern and private-IP-range blocklist before the app makes a server-side request to a user-supplied URL |
| File upload abuse | Type/size validation, malware scanning hook before files are made retrievable, signed URLs instead of public buckets |
| Rate limiting / abuse | Redis-backed limits per IP/user/org on auth, public forms, API |
| Secrets | `.env`-based config validated at boot (fails fast on missing/malformed vars); integration credentials encrypted at rest; no secrets in source control or logs |
| Transport security | TLS everywhere (terminated at Traefik/Nginx or Cloudflare), HSTS |
| Data at rest | Database-level encryption via the hosting provider/volume layer; sensitive integration credentials additionally encrypted at the application layer |

## 7. Payments & financial data

- No raw payment card data touches our servers — hosted payment flows only (Stripe Elements/Checkout, GoCardless, PayPal hosted flows).
- Webhook signature verification mandatory for every payment provider; idempotency keys on all payment-affecting operations to prevent double-processing on retried webhooks.
- `FinancialEvent` ledger is append-only/immutable — corrections are new events, not edits — enabling reconciliation and audit.
- Money arithmetic exclusively via integer minor-units/Decimal utilities; any PR introducing `Float` for money is a defect.

## 8. AI-specific security

| Risk | Control |
|---|---|
| Prompt injection via untrusted content (emails, uploaded docs, web pages, ticket text) | All such content is treated as **data**, never as instructions; the AI gateway enforces a structural separation between system instructions and retrieved/user content; tool-calling prompts explicitly instruct the model to disregard instructions found inside retrieved content |
| Unauthorised tool execution by an agent | `AIToolPermission` allowlist per agent; no agent can call a tool outside its configured set; destructive/financial/legal/outbound-communication tools require the configured autonomy level + approval |
| Unrestricted data access by an agent | Agents query through the same permission-checked service functions as human users — scoped to the org and, where configured, a narrower data-access policy per agent |
| Unrestricted AI-to-SQL | Never implemented — the AI Command Centre and all agents call typed service functions only |
| Runaway cost / abuse | Per-agent and per-org spend limits, token/cost accounting (`AIUsage`), alerting on anomalous usage, emergency stop control |
| PII over-exposure to model providers | Minimise PII sent in prompts where not needed for the task; redact/avoid sending full payment details; document per-provider data handling in `docs/AI_ARCHITECTURE.md` |
| Model provider outage/lock-in | Multi-provider gateway with fallback routing |
| Hallucinated facts presented as client data | AI outputs about client facts must cite source records; "no sufficient information" is a valid and expected output |
| Autonomous harmful action | 5-level autonomy model (read-only → recommend → draft → human-approved execution → policy-restricted autonomous execution); levels 4–5 gated per action-type, not globally, and never apply to financial charges, legal commitments, or destructive operations without an explicitly authorised narrow workflow |

Full AI architecture detail: `docs/AI_ARCHITECTURE.md`.

## 9. Data protection & compliance posture

- UK GDPR / GDPR-oriented controls: lawful basis tracking for marketing contacts (`ConsentRecord`), data subject export, data subject deletion (with tenant-configurable retention overrides for legal/financial record-keeping needs), data processing documented per integration.
- Org-level configurable retention policies, enforced by scheduled jobs (not manual purges).
- Security incident response: documented runbook (Phase 1 deliverable) covering detection, containment, tenant notification, and post-incident review — to be authored before handling real customer data.
- This platform does not currently claim ISO 27001 or SOC 2 certification; documentation is structured to ease a future audit.

## 10. Platform Super Admin risks

- Impersonation (if implemented) must be time-limited, require a logged justification, and be fully audited (`AuditLog`) — never silent or indefinite.
- Platform admin actions affecting a tenant (suspension, data export/deletion) are logged and, where feasible, notified to the affected org.

## 11. Residual risks / to revisit

- Row-Level Security at the Postgres level is deferred to Phase 2 as a defence-in-depth layer, not a Phase 1 blocker, given consistent service-layer enforcement is the primary control.
- WhatsApp Business / SMS provider-side data handling depends on third-party policies outside our direct control — documented as a dependency, not eliminated as a risk.
- Local/self-hosted model support (optional) widens the operational security surface (model hosting, patching) — deferred until there is customer demand.
