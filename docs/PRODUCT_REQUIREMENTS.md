# Product Requirements Document — EncifOne

## 1. Vision

Professional service businesses (agencies, MSPs, consultancies, accountants, freelancers, property managers, recruiters, creative studios) run their client relationships across 6–10 disconnected tools: a CRM for leads, a proposal tool, a separate contract/e-sign tool, a project manager, a helpdesk, an invoicing tool, a scheduling tool, and spreadsheets to track profitability because nothing else does. Data re-entry, context loss, and no single view of "is this client profitable and happy" are the norm.

**EncifOne is the single system of record and action for the full client lifecycle** — from lead to renewal — with an embedded AI workforce that does real operational work (drafts, summaries, detection, recommendations) under human-approved autonomy, not a bolted-on chat widget.

## 2. Target customers

Primary buyer: owner/operator of a professional services business with 2–50 staff, currently assembling point solutions. Supported verticals via **industry templates** (configuration, not forked code): digital/marketing/web agencies, IT/MSPs, cybersecurity consultancies, business/management consultants, accountants/bookkeepers, freelancers, property management, recruitment agencies, creative studios, facilities management, general SMEs.

Secondary buyer (Phase 2+): ops/finance leads at larger agencies (50–250 staff) needing profitability and resource-planning depth comparable to Zoho One / Dynamics 365.

## 3. Jobs to be done

1. **Win the client** — capture leads, qualify, propose, contract, collect deposit — without re-keying data between four tools.
2. **Onboard without drop-off** — turn a signed deal into a running engagement with zero manual checklist tracking.
3. **Deliver the work** — projects, tasks, time, service requests, SLAs — visible to the client without exposing internals.
4. **Get paid completely** — invoice everything billable; catch the work that quietly never gets billed.
5. **Know who's profitable** — true cost-to-serve per client, not just revenue.
6. **Keep clients** — see risk before churn, track every promise made, prove ROI at renewal time.
7. **Do more with the same headcount** — AI agents handle the repetitive 80%, humans approve and handle the judgment 20%.

## 4. Non-goals (for the product generally, not just MVP)

- Not a general-purpose project tool for non-client work (internal-only companies) — everything orbits the client relationship.
- Not a statutory accounting/bookkeeping system (no payroll, no full general ledger, no tax filing) — it integrates with Xero/QuickBooks rather than replacing them. See `docs/ARCHITECTURE.md` and the Finance module notes.
- Not an unrestricted automation platform like Zapier/Make for arbitrary SaaS-to-SaaS wiring — automation here is scoped to the client lifecycle, with a smaller, safer action set.
- Not a bulk/cold outbound marketing tool — consent and suppression-list enforcement are mandatory, not optional.

## 5. Industry template system

A template is a configuration bundle, applied at org creation and editable after:

- Enabled modules & sidebar items
- Terminology overrides (e.g. "Clients" → "Tenants" for property management; "Matters" for consultants)
- Default service catalogue entries & pricing models
- Default pipeline stages and client-journey stage set
- Custom field sets per object (Contact, Company, Project, Client)
- Default AI agent set and default autonomy levels per agent
- Default dashboard widget layout
- Starter document templates (proposal, contract, onboarding checklist)

Templates are additive and non-exclusive — an org can start from "Digital Agency" and still enable Finance's retainer-utilisation widgets used by MSP template. Implementation: a `Template` record referencing seed data + a `TemplateApplication` audit row per org; never a code fork.

## 6. Core modules — functional requirements summary

Full feature lists are in the originating brief; this section states acceptance-relevant requirements per module. (Numbering matches `docs/ROADMAP.md` phase groupings.)

### 6.1 Identity, Organisations & RBAC
- A user can belong to multiple organisations with different roles per org; switching orgs changes all visible data atomically.
- 14 baseline roles (Platform Super Admin → Read-only Auditor) plus custom roles with resource-level permission overrides.
- Every tenant-owned table carries `organisationId`; every service-layer query is scoped by the authenticated session's active org, never by a client-supplied value.

### 6.2 CRM (Leads, Contacts, Companies, Opportunities)
- Lead → Contact/Company promotion, dedupe & merge, custom fields/objects, saved views, bulk actions, lead-source attribution, consent fields.
- Explainable lead scoring: score = weighted function of defined factors (engagement, service fit, budget signal, enquiry quality, prior communication), each factor and weight visible to the user. No inference of protected characteristics.

### 6.3 Sales Pipeline & Proposals/Contracts
- Multiple pipelines, Kanban + forecast views, probability-weighted values, loss-reason tracking.
- Proposal/contract builder with reusable templates, dynamic variables, e-signature, acceptance+deposit in one flow.
- AI drafts proposals/follow-ups from template + structured data; AI never auto-finalises legal terms or sends without the configured approval step.

### 6.4 Client 360 & AI Client Memory
- One workspace per client aggregating services, contracts, projects, tickets, comms, invoices, profitability, satisfaction, risks/opportunities.
- AI Memory entries always carry `source`, `createdAt`, `confidenceLevel`; user can view/correct/delete/restrict any entry.

### 6.5 Client Journey Engine
- Configurable stage graph (Lead → … → Offboarding) with entry/exit conditions, required tasks/forms, SLA targets, and per-industry template variants.

### 6.6 Onboarding
- Forms, conditional questionnaires, document requests, checklist with task dependencies, progress tracking. No plaintext secrets collected via intake forms (see `docs/SECURITY.md`).

### 6.7 Client Portal (white-label)
- Per-client configurable module visibility; custom domain/branding; never exposes internal notes, costs, or private AI assessments — enforced at the API layer (portal session scope excludes those fields/tables entirely, not just hidden in UI).

### 6.8 Projects & Service Delivery
- Multiple views (list/board/calendar/Gantt), dependencies, time & budget tracking, formal change-request workflow for scope/cost/date changes.

### 6.9 Service Catalogue & Billing Entitlements
- Fixed/hourly/retainer/usage/subscription pricing models, public checkout, entitlements (included hours, request limits, revision limits) enforced in Service Requests.

### 6.10 Helpdesk / Service Requests
- Ticketing with SLA timers & business-hours calendars, routing/escalation, canned responses. AI classifies/prioritises/drafts; AI cannot assert work is complete without a verified completion record (a linked task/milestone marked done by a human or verified system event).

### 6.11 Universal Inbox
- Unified threads across authorised channels (email, SMS, WhatsApp Business, portal messages, Teams/Slack where supported); respects per-contact consent/opt-out; AI summarises/drafts/translates — never auto-sends outbound client comms above the org's configured autonomy level.

### 6.12 Finance & Billing
- Estimates → invoices → payments → reconciliation, multi-currency, VAT/tax config, Stripe/GoCardless/PayPal + manual bank transfer, Xero/QuickBooks sync.
- All money as integer minor-units/Decimal. Webhooks verified + idempotent. Immutable financial event log.
- Explicitly **not** a statutory accounting system; UI must not claim to be one.

### 6.13 Client Profitability Engine
- Per-client: contracted vs. actual vs. outstanding revenue, labour/contractor/software/direct cost, billable vs. non-billable hours, gross margin, effective hourly rate, retainer utilisation — with configurable overhead allocation and full calculation transparency (drill-down to source records).

### 6.14 Revenue Leakage & Scope Creep Detection
- Rule/evidence-based detection (completed-but-unbilled work, expired discounts still applied, lapsed retainers still serviced, etc.) with estimated impact + source evidence. AI never issues a charge or scope ruling autonomously — always a proposed draft awaiting approval.

### 6.15 Client Success & Retention
- Health score = transparent weighted blend of configurable indicators (default 20% each: engagement, payment behaviour, satisfaction, service performance, renewal signals); explicit handling + display of missing-data cases; churn-risk labels always carry evidence + confidence.

### 6.16 Promise Tracker
- Extracted commitments distinguish explicit promise vs. tentative statement vs. AI-inferred obligation, each with source, owner, due date, status; pre-due reminders to the owner.

### 6.17 Asset & Renewal Management
- Tracks domains/hosting/SSL/licences/contracts with renewal reminders; credentials only via a dedicated secrets integration, never stored as plain fields.

### 6.18 AI Workforce (Agents)
- 11 named agents (COO, Sales, Account Manager, Finance, PM, Support, Marketing, Onboarding, Compliance, Executive Assistant, Receptionist), each configurable: instructions, model, allowed tools, accessible data scope, schedule/triggers, approval requirement, spend limit, autonomy level (1–5), with execution/error history and a pause/emergency-stop control.

### 6.19 AI Command Centre
- Natural-language Q&A and action-proposals over permission-checked, typed service functions (never free-form SQL); always shows sources/calculations; actions route through the approval system.

### 6.20 Business Intelligence & Forecasting
- Transparent statistical methods by default; ML forecasting only introduced once there's enough data and after evaluation; every output labels assumptions/confidence/missing-data.

### 6.21 Workflow/Automation Builder
- Visual node editor (triggers/conditions/branches/delays/approvals/AI steps), dry-run mode, retries, cycle limits, execution budgets, versioning, execution logs; natural-language-to-workflow generation produces an inspectable draft, never a silently-published workflow.

### 6.22 Marketing & Lead Gen
- Forms/landing pages/sequences/campaigns with mandatory consent capture, unsubscribe handling, suppression lists, sending-rate limits.

### 6.23 Knowledge Base & RAG
- Org-scoped articles with semantic search; AI answers cite sources and say when information is insufficient; all ingested content (docs, email, web) treated as untrusted data for prompt-injection purposes.

### 6.24 Team & Resource Management
- Profiles, schedules, skills, timesheets, internal/contractor cost rates, workload-balancing recommendations — no automated employment decisions or covert monitoring.

### 6.25 Automated Client Reviews / ROI Engine
- Branded periodic reports connecting delivered work to outcomes; clearly separates measured results from estimated value.

### 6.26 Forms, Templates & Marketplace
- Reusable multi-step form builder; org-specific + platform-provided template library across contracts/proposals/invoices/projects/onboarding/workflows/reports/emails/agents/packages/industries.

### 6.27 Integrations & Developer Platform
- OAuth-based connections, scoped credentials, health monitoring, webhook subscriptions with retry, public REST API + OpenAPI docs. MCP server (later phase) exposes a curated tool set, never raw DB access.

### 6.28 Migration Assistant
- CSV/Excel + supported CRM/PM exports, AI-assisted field mapping, dry-run + rollback, import history/error reporting.

### 6.29 Platform Super Admin
- Org/subscription/trial/user management, platform revenue & AI-cost visibility, feature flags, system health, audit logs; support impersonation (if any) is time-limited, justified, and logged — never silent.

### 6.30 Subscription & Billing (platform-level)
- Tiered plans with entitlements (seats, clients, modules, AI credits, automation runs, storage, white-label, API access); usage metering before any "unlimited" claim; platform billing kept structurally separate from the invoices tenants send their own clients.

## 7. Non-functional requirements

- **Multi-tenancy:** strict server-side isolation (§5 of `docs/SECURITY.md`); no cross-tenant leakage via API, search, storage, AI retrieval, jobs, exports, or integrations.
- **Scalability:** must run acceptably on a single mid-size VPS for early customers; architecture must not block horizontal scaling later (stateless app tier, externalised session/cache/queue).
- **Availability target (post-MVP):** 99.5%+ for core app; documented RPO/RTO for backups.
- **Accessibility:** WCAG 2.1 AA-oriented for app and portal; keyboard navigation and colour-contrast compliance are launch requirements, not polish.
- **Internationalisation (Phase 2+):** multi-currency and multi-timezone are MVP; full UI localisation is not.
- **Auditability:** every privileged action (financial, permission, AI-approved-execution, data export/delete) writes an immutable audit log entry.

## 8. Explicit constraints carried from the brief

- No fabricated data, testimonials, customer counts, or statistics anywhere in app or marketing site.
- No AI-issued charges, signed legal commitments, or "work completed" claims without human approval / verified evidence.
- No plaintext credential collection via standard forms.
- No unrestricted AI SQL execution or unrestricted MCP database access.
- Floating-point arithmetic is prohibited for any money calculation.

## 9. Open questions / assumptions requiring future validation

See `docs/ROADMAP.md` §"Assumptions & dependencies" for the consolidated list (pricing/payment-provider availability by region, e-signature vendor choice, WhatsApp Business API approval lead time, hosting budget ceiling).
