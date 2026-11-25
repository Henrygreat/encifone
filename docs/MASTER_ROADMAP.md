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

### Phase 2 — CRM + Sales minimal + Proposal/Contract + Payment (deposit)
Scope: Lead/Contact/Company CRUD + CSV import, one pipeline + Kanban, Proposal builder (template + dynamic variables, no marketplace yet), e-signature integration (one provider), Stripe test-mode checkout for deposit, webhook handling + `FinancialEvent` ledger.
**Acceptance criteria:** steps 4–9 of the vertical slice work end-to-end in a staging environment with a real (test-mode) Stripe payment and a real e-sign completion.

### Phase 3 — Client 360 + Portal + Onboarding
Scope: Client record creation on deal-won, basic AI Memory (manual + one AI-extracted example), white-label portal shell with invitation flow, one onboarding checklist template.
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
