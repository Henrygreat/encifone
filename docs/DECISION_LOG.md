# Decision Log — EncifOne

Lightweight architectural decision record. Each entry: what was decided, why, and what it supersedes. Newest first. This is a log of decisions actually made, not a design proposal — see `docs/MASTER_ROADMAP.md` for what's planned.

---

## 2026-11-25 — Database standard: PostgreSQL 18 + pgvector

**Decision:** The approved database engine for EncifOne, in every environment, is **PostgreSQL 18 with the `pgvector` extension**, via the `pgvector/pgvector:pg18` Docker image locally and a separately-provisioned Coolify-managed PostgreSQL 18 + pgvector instance in production. **This supersedes the earlier PostgreSQL 16 (and any prior PostgreSQL 17) configuration.**

**Why:** pgvector readiness is needed ahead of the planned AI Client Memory, Client Digital Twin, semantic search, document embeddings, RAG, and knowledge-base modules (`docs/MASTER_ROADMAP.md` Phase 11+), and the user made an explicit platform decision to standardise on PG18 + pgvector for Coolify hosting.

**What changed:**
- Local dev: `postgres:16-alpine` → `pgvector/pgvector:pg18`, on a **new** Docker volume (`postgres_data_pg18`) mounted at `/var/lib/postgresql` (not `.../data` — PG18's official images moved `PGDATA` to a version-specific subdirectory and moved the declared `VOLUME` up a level; see `docs/DEPLOYMENT.md` §3). The old `postgres_data` (PG16) volume and a `pg_dump` backup (`backups/clientos_pg16_backup_20261125.{dump,sql}`, gitignored) were both retained, not deleted, pending explicit approval.
- A new Prisma migration (`20261125124136_enable_pgvector`) runs `CREATE EXTENSION IF NOT EXISTS vector;`. No vector column, index, or AI table was added — that's explicitly out of scope until the Knowledge Base/RAG phase.
- `docker-compose.yml` was split into a production-safe base file (no Postgres container — production uses the externally-provisioned Coolify instance; no public port for Redis) and `docker-compose.local.yml` (adds the local Postgres 18 + pgvector container, republishes local ports). Production never runs a duplicate Postgres container.
- CI's ephemeral test-database service container also moved to `pgvector/pgvector:pg18`, with an explicit step asserting the `vector` extension is enabled.

**Known caveat:** Prisma's schema-engine introspection (`prisma db pull`) has a reported panic against some PostgreSQL 18 `NOT NULL` constraint metadata on Prisma ORM 7.x (fixed in 8.x). This project's workflow is schema-first (hand-written `schema.prisma` + generated migrations), which does not exercise that code path — but avoid running `prisma db pull` against this database on Prisma 7 until upgrading to Prisma 8.

**Validated:** connectivity, `prisma validate`, migrations (including the new one), pgvector extension presence, authentication, organisation management, tenant isolation, worker connectivity, lint, typecheck, automated tests, and both local (`pnpm build`) and Docker production builds — all against the restored PG18 database. See `docs/IMPLEMENTATION_STATUS.md` for the full validation record.

---

## 2026-11-25 — Rebrand: ClientOS AI → EncifOne

**Decision:** Product name changed from the working name "ClientOS AI" to **EncifOne**, centralised in `src/config/branding.ts`.

**Why:** Official branding decision; a GitHub repository (`github.com/Henrygreat/encifone`) was created under the new name.

**What changed:** Page metadata, auth pages, sidebar header, worker logs, `package.json` name, and all documentation. **What didn't change** (to avoid data loss/unnecessary churn): the Docker Compose project name and volumes, the Postgres role/database name already initialised in the (then-PG16) volume, the active-org cookie key, and all Prisma model/migration names — none of these are customer-facing branding. See `docs/IMPLEMENTATION_STATUS.md`.

---

## 2026-11-25 — GitHub repository connection and branching strategy

**Decision:** Connected the local repository to `https://github.com/Henrygreat/encifone.git` as `origin`. Adopted `main` (stable/tagged) + `develop` (ongoing) + `feature/*`/`hotfix/*` branching.

**Why:** Move from a local-only repo to a shared, CI-backed GitHub workflow ahead of further development.

**Context:** The remote was empty (no existing commits/branches) when connected, so the full local history was pushed directly — no merge or force-push was needed.

---

## 2026-11-25 — Prisma 7: datasource URL moved out of `schema.prisma`

**Decision:** Adopted Prisma 7's new configuration model: the database connection URL lives in `prisma.config.ts` (via the `PrismaPg` driver adapter) and is passed to `PrismaClient` at runtime, not declared via `datasource.url` in `schema.prisma` (no longer supported there as of Prisma 7).

**Why:** Prisma 7 made this a breaking requirement, not a choice. `prisma.config.ts` reads `process.env.DATABASE_URL` directly (not the `env()` config helper) specifically so `prisma generate` doesn't require a real database connection to succeed — this matters for Docker layer caching, where `prisma generate` runs in a `deps` build stage before any real `DATABASE_URL` is available.

---

## 2026-11-25 — Cache Components disabled

**Decision:** Next.js 16's `cacheComponents` (the PPR successor, on by default in a fresh scaffold) is explicitly set to `false` in `next.config.ts`.

**Why:** This application is session/tenant-scoped on nearly every route (`docs/ARCHITECTURE.md` §4) — a prerendering-first caching model doesn't fit, and sprinkling `"use cache"` boundaries through pages that are dynamic by design would be working against the architecture rather than with it. Revisit only if a genuinely static, cacheable surface (e.g. the eventual public marketing site) needs it.

---

## 2026-11-25 — Modular monolith, not microservices

**Decision:** EncifOne is built as a modular monolith (one Next.js app, one database, domain-separated modules) with independent BullMQ workers, not a microservices architecture.

**Why:** At MVP/early-growth scale, microservices add deployment and observability overhead with no corresponding benefit for a small team and still-settling domain boundaries. See `docs/ARCHITECTURE.md` §1 for the full rationale and the conditions under which this would be revisited.

---

## 2026-11-25 — Core technology stack (Phase 0)

**Decision:** Next.js (App Router) + TypeScript (strict) + Tailwind CSS + shadcn/ui (Radix UI primitives) on the frontend; PostgreSQL + Prisma + Redis + BullMQ on the backend; a provider-agnostic AI gateway (not locked to one model provider); Docker Compose + Coolify for hosting (explicitly not Vercel).

**Why:** See `docs/ARCHITECTURE.md` and `docs/PRODUCT_REQUIREMENTS.md` for the full rationale, competitive analysis, and alternatives considered.
