# Database Schema / Domain Model — EncifOne

This is the Phase 0 entity inventory and relationship map — not a requirement to build every table in Phase 1. See `docs/ROADMAP.md` for which entities ship in the MVP vertical slice.

## 1. Tenancy & conventions

- Every tenant-owned entity has `organisationId` (FK → `Organisation`, indexed, non-nullable).
- Primary keys: `cuid`/`uuid`. Timestamps: `createdAt`, `updatedAt` on all entities; soft-delete (`deletedAt`) on entities with compliance/retention requirements (Contact, Company, Client, Invoice, Document).
- Money fields: integer minor-units (e.g. `amountMinor: Int`, `currency: String(3)`), never `Float`.
- All entities below are grouped by domain module (matches `docs/ARCHITECTURE.md` §3).

## 2. Identity & platform

- **User** — global identity (email, auth credentials/OAuth links, MFA config). Not tenant-owned.
- **Organisation** — tenant root. Branding, default currency, timezone, retention policy, template reference.
- **Membership** — `User` × `Organisation` with `role`, `status`, `isActive` (supports multi-org membership + org switching).
- **Role** / **Permission** — baseline + custom roles; `RolePermission` join; resource-level overrides via `PermissionGrant` (subject, resource type, resource id|wildcard, action).
- **Team** — groups of memberships within an org (departments).
- **SubscriptionPlan** / **OrganisationSubscription** / **UsageMeter** — platform billing & entitlements (distinct from tenant-facing `Invoice`).
- **FeatureFlag** — platform- or org-scoped toggles.
- **Template** / **TemplateApplication** — industry template definitions and their application to an org.
- **AuditLog** — immutable append-only log: actor, org, action, resource, before/after (redacted where sensitive), timestamp.

## 3. CRM

- **Company** — supports parent/subsidiary via `parentCompanyId` self-relation.
- **Contact** — belongs to `Company` (optional), owner (`Membership`), lifecycle stage, consent fields.
- **Lead** — pre-qualification record; converts into `Contact`/`Company`/`Opportunity`.
- **CustomField** / **CustomFieldValue** — polymorphic custom fields per object type; **CustomObject** for fully custom entities (Phase 2+).
- **Tag**, **Segment** — many-to-many labelling.
- **LeadScore** — factor breakdown + weights + resulting score, linked to `Lead`/`Contact` (explainability requirement).

## 4. Sales

- **Pipeline** / **PipelineStage** — org-defined, multiple pipelines.
- **Opportunity** — value, probability, stage, expected close, loss reason, linked `Contact`/`Company`.
- **Proposal** — versioned document; **ProposalLine** for pricing/options.
- **Contract** / **ContractVersion** — versioned legal documents; **Signature** (evidence: signer, IP, timestamp, method).

## 5. Clients

- **Client** — the "won" relationship; references originating `Opportunity`/`Company`.
- **ClientMemory** — structured AI memory entries: `fact`, `source`, `confidenceLevel`, `createdAt`, `reviewedBy`, `isRestricted`.
- **ClientGoal**, **ClientCommitment** (Promise Tracker) — see §9.
- **ClientHealthScore** — snapshot with factor breakdown + weights + missing-data flags.
- **ClientJourneyStage** — current stage + history, per `ClientJourneyTemplate`.

## 6. Onboarding & Portal

- **OnboardingFlow** / **OnboardingStep** — checklist items, dependencies, assignees.
- **Form** / **FormField** / **FormSubmission** — reusable builder (also used by onboarding, marketing, service requests).
- **PortalConfig** — per-client module visibility, branding overrides, custom domain.

## 7. Projects & Delivery

- **Project** — linked to `Client`, optional `Contract`/`Proposal`.
- **Milestone**, **Task**, **TaskDependency**, **TimeEntry**, **ChangeRequest** (formal scope/cost/date change record).
- **RaidItem** (Risk/Assumption/Issue/Dependency) — risk register.

## 8. Catalogue, Finance & Profitability

- **Service** / **ServicePackage** / **ServiceEntitlement** (included hours/requests/revisions) / **ServiceSubscription**.
- **Estimate**, **Invoice** / **InvoiceLine**, **Payment**, **CreditNote**, **Retainer**, **Expense**.
- **FinancialEvent** — immutable ledger of billing-relevant events (created/paid/refunded/reconciled) — source of truth for reconciliation, separate from mutable `Invoice` display state.
- **ProfitabilitySnapshot** — per-client, per-period: revenue, cost breakdown, margin, effective rate (computed, cached, re-derivable from source records).
- **RevenueLeakageFinding** / **ScopeCreepFinding** — detection output: type, evidence refs, estimated impact, status (open/approved/dismissed), linked draft invoice/change-request if approved.

## 9. Success, Assets & Commitments

- **NpsResponse**, **ClientFeedback**, **ReferralRecord**.
- **ClientCommitment** (Promise Tracker) — `statementType` (explicit/tentative/ai-inferred), `source`, `owner`, `dueDate`, `status`, `evidenceRefs`.
- **Asset** / **AssetRenewal** — type, owner, vendor, cost/resale price, renewal date, linked `Contract`.

## 10. Helpdesk, Inbox & Scheduling

- **Ticket** / **SlaPolicy** / **BusinessHoursCalendar** / **CannedResponse**.
- **Conversation** / **Message** — channel-agnostic thread model; **ChannelConnection** (per-integration config).
- **AppointmentType**, **Availability**, **Meeting**.

## 11. AI & Automation

- **AIAgent** — config: instructions, model, allowed tools, data scope, schedule/triggers, autonomy level, spend limit.
- **AIAgentExecution** — run record: input, output, tools invoked, cost, status, error.
- **AIToolPermission** — which tools an agent/role may invoke.
- **AIApproval** — pending/approved/rejected human-in-the-loop decision linked to an `AIAgentExecution` or workflow step.
- **AIUsage** — token/cost accounting per org/agent/model/day (drives billing + cost monitoring).
- **Workflow** / **WorkflowVersion** / **WorkflowExecution** — automation builder definitions and run logs.
- **KnowledgeArticle** / **KnowledgeChunk** (with `pgvector` embedding column) — RAG corpus, org-scoped.

## 12. Marketing, Team & Integrations

- **Campaign**, **EmailSequence**, **SuppressionListEntry**, **ConsentRecord**.
- **TeamProfile** extension of `Membership` (skills, schedule, internal/contractor rate).
- **Document** — generic file metadata (S3 key, owner object, access scope).
- **Integration** / **IntegrationCredential** (encrypted) / **WebhookSubscription** / **IntegrationSyncLog**.
- **Notification**.

## 13. Key relationships (selected)

```
Organisation 1───* Membership *───1 User
Organisation 1───* Client 1───* Project 1───* Task
Client 1───* Invoice 1───* InvoiceLine
Client 1───* ClientMemory
Client 1───1 ClientHealthScore (latest) ,1───* ClientHealthScore (history)
Opportunity 1───* Proposal 1───1 Contract
AIAgent 1───* AIAgentExecution *───* AIToolPermission
Workflow 1───* WorkflowVersion 1───* WorkflowExecution
KnowledgeArticle 1───* KnowledgeChunk (embedding)
```

## 14. Indexing & uniqueness rules

- Composite index `(organisationId, <primary filter field>)` on every high-traffic tenant table (Task.status, Ticket.status, Invoice.status, etc.).
- Unique constraint `(organisationId, email)` on `Contact` for dedupe; global unique on `User.email`.
- Unique `(organisationId, slug)` on anything portal-addressable (Service, Form, KnowledgeArticle).
- `ClientCommitment.dueDate` and `AssetRenewal.renewalDate` indexed for reminder-scan jobs.
- `pgvector` index (HNSW or IVFFlat) on `KnowledgeChunk.embedding`, always queried with an `organisationId` predicate.

## 15. Avoiding redundant models

Single source of truth per concern: one `Client` (not separate "Account"), one `Contact` (not separate "Person"/"Lead-contact"), one `Document` table for all attachments (polymorphic owner reference) rather than per-module file tables, one `FinancialEvent` ledger rather than duplicated status fields across Invoice/Payment/CreditNote.
