# EncifOne

**One platform. Intelligent business.**
*Acquire. Manage. Deliver. Automate. Grow.*

EncifOne is an AI-powered Client Operating System for professional service businesses (agencies, MSPs, consultancies, accountants, freelancers, property managers, recruiters, and similar firms).

EncifOne unifies CRM, proposals/contracts, client portals, project & service delivery, finance/profitability, and an AI workforce into one multi-tenant SaaS platform — replacing the typical 6–10 tool stack (HubSpot + HoneyBook + ClickUp + Zoho + Zapier + spreadsheets) with one coherent system.

> Product name, branding, colours, and commercial configuration are all tenant/platform configurable — platform-level branding lives in `src/config/branding.ts`; per-tenant white-label overrides are covered in `docs/DESIGN_SYSTEM.md` §"Whitelabel & theming".

**Repository:** https://github.com/Henrygreat/encifone

## Status

**Phase 1 — Foundations & scaffolding**, **Phase 1.1 — GitHub integration, branding & database standardisation (PostgreSQL 18 + pgvector)**, and **Phase 1.5 — Production infrastructure hardening** are all complete: auth, organisations, multi-org membership/switching, RBAC, and the base app shell are implemented and runnable on the approved database standard. **Phase 2A — CRM & sales core (Milestones A–D: contacts/companies/leads with conversion, sales pipeline with a drag-and-drop Kanban board, activities, a real-data dashboard, and a premium UI/UX transformation including a React Three Fiber hero/AI-orb) is also complete** — see `docs/CRM_USER_GUIDE.md` for how to use it. See `docs/IMPLEMENTATION_STATUS.md` for the full build record and what's explicitly deferred, and `docs/MASTER_ROADMAP.md` for what's next.

## Documentation map

| Doc | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Working agreement for AI coding sessions in this repo |
| [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) | Vision, personas, functional & non-functional requirements |
| [`docs/COMPETITOR_ANALYSIS.md`](./docs/COMPETITOR_ANALYSIS.md) | Feature matrix, gaps, differentiation strategy (Phase 0, full category) |
| [`docs/COMPETITIVE_ANALYSIS.md`](./docs/COMPETITIVE_ANALYSIS.md) | CRM/sales-category-specific competitor research (Phase 2) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture, module boundaries, API design |
| [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) | Domain model / ERD, tenancy & indexing rules |
| [`docs/AI_ARCHITECTURE.md`](./docs/AI_ARCHITECTURE.md) | Provider-agnostic AI service, agent framework, autonomy levels |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model, tenant isolation, AI security, compliance posture |
| [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) | Visual language, components, theming |
| [`docs/CRM_USER_GUIDE.md`](./docs/CRM_USER_GUIDE.md) | How to use what's built so far: contacts, companies, leads, pipeline, dashboard |
| [`docs/MASTER_ROADMAP.md`](./docs/MASTER_ROADMAP.md) | MVP scope, vertical slice, phased roadmap, acceptance criteria |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Infra, Docker/Compose, CI/CD, backups |
| [`docs/TESTING.md`](./docs/TESTING.md) | Test strategy per layer |
| [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) | What's built vs. not, known limitations |
| [`docs/DECISION_LOG.md`](./docs/DECISION_LOG.md) | Architectural decisions actually made, newest first |

## Technology stack

- **Frontend:** Next.js (App Router) + React + TypeScript (strict) + Tailwind CSS + shadcn/ui + Radix UI + TanStack Query/Table + React Hook Form + Zod + dnd-kit + TipTap + Framer Motion
- **Backend:** Next.js server layer + **PostgreSQL 18 + pgvector** (standard — see `docs/DECISION_LOG.md`) + Prisma + Redis + BullMQ + SSE/WebSockets + S3-compatible storage
- **Auth:** Auth.js (NextAuth) or Better Auth — email/password, passwordless, Google/Microsoft OAuth, MFA, org memberships
- **AI:** Provider-agnostic gateway (Anthropic, OpenAI, Gemini, OpenRouter, optional local models)
- **Infra:** Docker Compose, Coolify-compatible, GitHub Actions CI/CD, Traefik/Nginx, Cloudflare

Full rationale in `docs/ARCHITECTURE.md`.

## Getting started

Local dev always uses **two** compose files together — `docker-compose.yml` (the production-safe base: no Postgres container, no public Redis port) plus `docker-compose.local.yml` (adds a local PostgreSQL 18 + pgvector container and republishes ports). Never use the base file alone locally, and never point a production/Coolify deploy at the local file.

### Option A — everything in Docker

```bash
cp .env.example .env   # adjust secrets if you like; defaults work locally
pnpm docker:local up -d --build
```

This starts Postgres 18 + pgvector, Redis, the app (http://localhost:3000), a migration job that runs automatically, and the background worker.

### Option B — app on the host, infra in Docker (faster iteration)

```bash
pnpm install
cp .env.example .env
pnpm docker:local up -d postgres redis   # host ports 5433 / 6380 by default
pnpm db:migrate:dev
pnpm dev            # app at http://localhost:3000
pnpm worker          # in a second terminal, if you need the background worker
```

### Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / run |
| `pnpm test` | Vitest (unit + integration — needs Postgres/Redis reachable) |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm db:migrate:dev` | Create & apply a Prisma migration (dev) |
| `pnpm db:migrate:deploy` | Apply pending migrations (CI/prod) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm worker` | Run the BullMQ worker locally |
| `pnpm docker:local <args>` | `docker compose` with both the base and local override files |

Health check: `GET /api/health` reports Postgres and Redis connectivity.
