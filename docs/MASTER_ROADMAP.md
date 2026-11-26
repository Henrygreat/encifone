# Roadmap & MVP Scope — EncifOne

## 1. Guiding rule

Build and validate one thin, end-to-end vertical slice before expanding breadth. No phase implements more than one or two domain modules at production quality; everything else stays out of scope until its phase arrives.

## 2. MVP vertical slice (validates the architecture)

Exactly the 20-step journey from the product brief — this is the acceptance test for the MVP, not a feature list to implement piecemeal:

1. Owner registers → 2. Organisation created → 3. Branding configured → 4. Lead submits enquiry → 5. Lead appears in CRM → 6. Opportunity created → 7. Proposal generated → 8. Client reviews & accepts → 9. Test-mode deposit payment recorded (Stripe test mode) → 10. Client receives portal invitation → 11. Onboarding begins → 12. Project + tasks created → 13. Client submits a service request → 14. Team records time & delivers → 15. Client approves deliverable → 16. Draft invoice generated → 17. Payment reconciled → 18. Dashboard reflects financial activity → 19. AI assistant summarises the client relationship from authorised records → 20. Audit logs record all of the above.

**Modules required for this slice, minimum viable depth only:** `identity`, `crm` (lead/contact/company, no scoring yet), `sales` (one pipeline, proposal with e-sign + Stripe-test deposit), `clients` (Client 360, basic AI memory), `portal` (invitation + minimal module set), `onboarding` (one checklist flow), `projects` (project/task, no Gantt/dependencies yet), `helpdesk` (basic service request, no SLA timers yet), `finance` (invoice + payment + reconciliation, test-mode only), `reporting` (dashboard reflecting real data), `ai-agents`/`ai-gateway` (one-shot Client 360 summarisation via Command Centre, read-only autonomy level 1), `audit`.

**Explicitly deferred past MVP:** multi-pipeline, custom fields/objects, workflow automation builder, universal inbox beyond basic messaging, revenue leakage/scope-creep detection, profitability engine depth, promise tracker, asset/renewal management, marketing module, knowledge base/RAG, migration assistant, platform super admin beyond basic org management, industry template variety (ship with one default template), most of the 11 AI agents (ship Command Centre read-only queries first).

## 3. Phased plan

### Phase 0 — Architecture & planning (this phase)
Deliverables: this document set (`docs/*.md`), `.env.example`, `CLAUDE.md`, `README.md`. **Status: in progress, see `docs/IMPLEMENTATION_STATUS.md`.**

### Phase 1 — Foundations & scaffolding
Scope: repo scaffolding (Next.js + TS strict + Tailwind + shadcn/ui), Prisma schema for `identity`/`platform` entities, Postgres+Redis via Docker Compose, auth (email/password + Google OAuth minimum, MFA stub), org creation + switching, RBAC middleware, base UI shell (sidebar, command palette skeleton, dashboard shell with empty states), health check endpoint, CI pipeline (lint/typecheck/test/build), audit log plumbing.
**Acceptance criteria:**
- A user can register, create an org, invite a second user with a different role, and switch between two orgs with visibly different data scoping.
- An attempt to access another org's data via a direct API call (same authenticated user, wrong org context) is rejected — covered by an automated test.
- `docker compose up` brings up app+DB+Redis+worker locally from a clean clone, migrations run automatically.
- CI pipeline passes on a clean PR: lint, typecheck, unit tests, build.

### Phase 1.1 — GitHub integration, branding, and database standardisation (complete)
Scope: connected the repository to GitHub (`main`/`develop` branching, CI), rebranded ClientOS AI → EncifOne, and standardised the database on **PostgreSQL 18 + pgvector** (`pgvector/pgvector:pg18` locally; a separately-provisioned Coolify-managed instance in production) ahead of the Knowledge Base/RAG phases — extension enabled via migration only, no AI tables yet. Full record in `docs/DECISION_LOG.md` and `docs/IMPLEMENTATION_STATUS.md`.
**Acceptance criteria:**
- GitHub remote connected, `main`/`develop` pushed, `v0.1.0` tagged, no force-push/history loss.
- Existing local database data preserved and validated across the PG16→PG18 migration (row-count + migration-history comparison); old volume/backup retained pending approval to delete.
- Production compose path (`docker-compose.yml` alone) defines no Postgres container and publishes no public port for Postgres/Redis.
- Lint, typecheck, `prisma validate`, dependency audit, automated tests, and both local and Docker production builds all pass against PostgreSQL 18 + pgvector.

### Phase 1.5 — Production Infrastructure Hardening & Deployment Reliability (implementation complete, pending approval/merge and live verification)
Scope: permanently fix the root causes behind the production deployment issues this project had already hit (Docker build errors, Prisma P1001, Docker-network isolation, Redis env-var inconsistencies, missing runtime env vars, migration checksum mismatches, GitHub Actions failures, incorrect reverse-proxy domain assignment, 502s, missing `NEXTAUTH_URL`, Next.js container-hostname binding) — not workarounds. Split health checks, worker heartbeat monitoring, non-root containers + resource limits + `GIT_SHA` version tracking, a `.gitattributes` fix for a recurring migration-checksum/line-ending bug, centralised env-var classification, five new operational scripts, and CI additions (migration-integrity check, Compose config validation, a multi-network binding reproduction test, and a production-image smoke test). Full record: `docs/DECISION_LOG.md`, `docs/IMPLEMENTATION_STATUS.md`. Operational docs: `docs/DEPLOYMENT_RUNBOOK.md`, `docs/TROUBLESHOOTING.md`, `docs/ROLLBACK.md`.
**Acceptance criteria:**
- Next.js confirmed binding to `0.0.0.0:3000` (via `/proc/net/tcp`), not a single interface — both inside a locally-built container and reproduced/asserted in CI across two attached Docker networks.
- A full register → sign in → session → authenticated-API-call round trip passes locally and in CI, against the actual production Docker images (not the dev server) — confirming the `NEXTAUTH_URL`/`secret` fixes.
- `scripts/check-migration-integrity.sh` demonstrated to both pass on a clean state and fail on a deliberately tampered commit; wired into CI.
- Lint, typecheck, dependency audit, automated tests, Compose config validation, the multi-network test, and the production-image smoke test all pass in CI.
- No previously-applied migration modified; no production data touched; nothing merged to `master`/`develop` or deployed without explicit approval.
- Everything requiring the live Coolify/production environment to confirm (database network-isolation fix, domain-assignment behaviour after removing the app's published port, actual zero-downtime rollback, branch-protection/deploy-trigger configuration) is explicitly listed as pending in `docs/IMPLEMENTATION_STATUS.md`, not claimed as done.

### Phase 2 — Intelligent CRM, Sales Pipeline & Client Acquisition
Decomposed into subphases (reconciled 2026-11-26 — see `docs/DECISION_LOG.md`). Under the master-first workflow adopted 2026-11-26 (`CLAUDE.md` §"Git workflow"), each subphase targets `master` directly once CI passes locally; a short-lived `feature/phase-2.N-*` branch is used only where a subphase is high-risk or multi-day, and is merged back into `master` (not `develop`, which is no longer an active integration target) and deleted promptly once its own acceptance criteria pass and CI is green. Original single-phase scope ("Lead/Contact/Company CRUD + CSV import, one pipeline + Kanban, Proposal builder, e-signature, Stripe test-mode deposit") is preserved — this is that same scope broken down to match the detail level requested at kickoff, plus two deliberate, narrow pull-forwards from Phase 3 (noted below).

**Phase 2A — reconciled 2026-11-26 (see `docs/DECISION_LOG.md`), Milestones A–D complete:** 2.1 + 2.2 below, plus a new Activities/Tasks module (calls/meetings/emails/notes/follow-ups — not previously a named subphase), delivered together as one combined CRM-and-sales-core build alongside a full premium UI/UX transformation (design system v2, Bento dashboard, navigation redesign, React Three Fiber). Milestone A (audit + design foundation), B (CRM services/API/UI for contacts/companies/leads), C (sales pipeline + Kanban + activities), and D (real-data dashboard + 3D hero/orb) are all complete and CI-verified — see `docs/IMPLEMENTATION_STATUS.md` and `docs/CRM_USER_GUIDE.md`. Milestone E (final QA pass + docs sweep) closes out the phase. 2.3+ resumes once 2A's acceptance criteria below are met.

- **2.1 — Intelligent CRM foundation:** Company/Contact/Lead models, custom fields, tags, search/filter/saved views, CSV import/export, dedup/merge, soft delete, activity audit.
- **2.2 — Sales pipeline & opportunity management:** multi-pipeline, configurable stages, Kanban + table views, forecasting, stage-history audit.
- **2.3 — Client 360 workspace** *(narrow pull-forward from Phase 3 — workspace/record only; portal invitation, onboarding, and client-facing access remain Phase 3 scope, unchanged)*.
- **2.4 — Service catalogue & pricing:** products/services/packages, minor-unit money, historical price snapshots.
- **2.5 — Proposals & quotations:** builder, versioning, secure public links, AI-assisted drafting (no invented prices/terms).
- **2.6 — Contracts & e-signature:** templates, versioning, signing, provider abstraction (no compliance/certification claims).
- **2.7 — Payments & lead-to-client conversion** *(narrow pull-forward from Phase 3 — creates the `Client` record on conversion; portal/onboarding still Phase 3)*: Stripe test-mode, webhook idempotency, configurable conversion gating (contract and/or payment required), Stripe Connect assessed for tenant fund collection.
- **2.8 — AI sales intelligence** *(narrow pull-forward from Phase 9/11 — sales-context only, not the full AI workforce)*: provider-agnostic lead scoring (explainable, no protected characteristics), next-best-action, pgvector-backed tenant-isolated AI client memory (first real use of the extension enabled in Phase 1.1).

**Acceptance criteria (unchanged from the original Phase 2):** steps 4–9 of the vertical slice work end-to-end in a staging environment with a real (test-mode) Stripe payment and a real e-sign completion — now achieved across 2.1–2.7, with 2.8 as an enhancement layer on top.

Competitive research for this phase: `docs/COMPETITIVE_ANALYSIS.md` (CRM/sales-category-specific; supplements, doesn't replace, the broader `docs/COMPETITOR_ANALYSIS.md` from Phase 0).

### Phase 3 — Client Portal + Onboarding
Scope: narrowed from the original (Client record creation and basic AI Memory moved into Phase 2.3/2.7 above) to what's left: white-label portal shell with invitation flow, one onboarding checklist template, and deepening AI Client Memory beyond the Phase 2.8 foundation.
**Acceptance criteria:** steps 10–11 work end-to-end; a client user can log into their portal and see only their own org/client-scoped data (verified by isolation test); internal-only fields (cost/notes) are absent from the portal API response, not just hidden in UI.

### Phase 4 — Projects + Service Requests + Time + Invoicing
Scope: Project/Task CRUD (one view type — list/board — Gantt deferred), basic service-request submission + resolution, time entry, invoice generation from completed/approved work, payment reconciliation.
**Acceptance criteria:** steps 12–17 work end-to-end; an invoice total reconciles exactly against recorded payments in a test; no floating-point rounding defects in a seeded test matrix of amounts/currencies.

### Phase 5 — Dashboard + AI Command Centre (read-only) + Audit
Scope: Bento dashboard with real computed KPIs (not mocked), AI Command Centre answering at minimum "summarise this client relationship" and 2–3 other read-only queries via the typed tool registry, full audit trail across the slice.
**Acceptance criteria:** steps 18–20 work end-to-end; every KPI on the dashboard has a documented calculation (linked from the UI) and a working drill-down; the AI summary cites its sources; the audit log contains an entry for every state-changing step in the full 20-step journey when run end-to-end.

**→ End of Phase 5 = MVP complete, vertical slice fully demonstrable.** Re-evaluate priorities with real/pilot customer feedback before Phase 6.

### Phase 6+ (indicative order, to be re-prioritised post-MVP feedback)
6. Helpdesk depth (SLAs, routing, canned responses) + Universal Inbox (email channel first)
7. Client Profitability Engine + Revenue Leakage Detector
8. Workflow/Automation Builder (visual, with dry-run)
9. AI Workforce expansion (Sales Agent, Support Agent, Finance Agent at autonomy levels 2–3)
10. Client Success module (health scores, NPS, Promise Tracker)
11. Knowledge Base + RAG
12. Asset & Renewal Management
13. Marketing & Lead Gen
14. Industry template system expansion (beyond the one default template)
15. Public API + Integration ecosystem expansion + Migration Assistant
16. Platform Super Admin depth + subscription/billing self-serve
17. Scope Creep Detection, Automated Client Reviews/ROI Engine, remaining AI agents, MCP server

## 4. Assumptions & dependencies (to validate before/at Phase 2)

- **E-signature provider**: an established third-party vendor will be integrated rather than building signature-evidence handling from scratch — vendor choice (and its cost) TBD, pending pricing/API review.
- **Payment providers**: Stripe is the primary target for MVP (best test-mode + webhook ergonomics); GoCardless/PayPal/Paystack/Flutterwave are additive, not MVP-blocking.
- **WhatsApp Business Platform** access requires Meta Business verification with unpredictable lead time — not MVP-blocking; deferred to the Universal Inbox phase.
- **Xero/QuickBooks** integrations require their respective developer app review processes — plan for lead time before Phase 6 if prioritised.
- **AI provider accounts**: Anthropic + at least one alternative (OpenAI or Gemini) API access needed from Phase 5 onward for gateway fallback testing.
- **Hosting budget ceiling** for the initial VPS is not yet specified by the business owner — see §5 for a planning estimate pending confirmation.

## 5. Infrastructure cost estimate (planning-level, not a quote)

| Item | Estimate (monthly, USD) | Notes |
|---|---|---|
| VPS (4–8 vCPU/8–16GB, app+DB+Redis+worker) | $40–$120 | Scales up with customer count; single box sufficient through early growth |
| S3-compatible object storage | $5–$25 | Usage-dependent |
| Backups (automated snapshots) | $5–$15 | |
| Domain/DNS/Cloudflare | $0–$20 | Free tier viable initially |
| AI provider usage (Anthropic/OpenAI/Gemini) | Variable, usage-metered | Pass-through cost; must be covered by AI-credit entitlement pricing, not absorbed indefinitely |
| E-signature vendor | $0–$50+/mo tier-dependent | Vendor TBD |
| Error monitoring (Sentry-compatible) | $0–$26 | Free tier viable initially |
| **Estimated early-stage total** | **~$50–$250/mo excluding AI usage** | Confirm against actual business budget before committing to a specific VPS/vendor tier |

## 6. Limitations acknowledged now

- This roadmap assumes a small initial engineering effort (not a large team); phase sequencing would compress with more engineers but the *order* and acceptance criteria should still hold.
- No statutory accounting functionality is planned; Finance module is operational billing + reconciliation + accounting-software sync only (see `docs/PRODUCT_REQUIREMENTS.md` §4).
- Enterprise SSO, full MCP server, and most of the AI workforce are explicitly post-MVP — do not market them as available until their phase completes.
