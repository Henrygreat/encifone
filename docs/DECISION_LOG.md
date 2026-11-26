# Decision Log — EncifOne

Lightweight architectural decision record. Each entry: what was decided, why, and what it supersedes. Newest first. This is a log of decisions actually made, not a design proposal — see `docs/MASTER_ROADMAP.md` for what's planned.

---

## 2026-11-26 — Phase 2 scope reconciliation: subphases, with two narrow pull-forwards from Phase 3

**Decision:** `docs/MASTER_ROADMAP.md`'s single "Phase 2" entry is decomposed into subphases 2.1–2.8 (CRM foundation, sales pipeline, client workspace, service catalogue, proposals, contracts, payments/conversion, AI sales intelligence), each on its own feature branch. This is the same Phase 2 scope as originally planned, broken down to the detail level requested at Phase 2 kickoff — not a scope expansion.

**Two deliberate, narrow deviations from the original phase boundaries:**
1. **Client 360 workspace (2.3)** is pulled forward from Phase 3 — but only the internal workspace/record view. Client portal invitation, client-facing login, and onboarding remain Phase 3, unchanged.
2. **Client record creation on conversion (2.7)** is pulled forward from Phase 3 for the same reason — payments/conversion logically needs a `Client` record to convert *into*. Portal/onboarding activation of that client is still Phase 3.

Both are scoped narrowly (data model + internal view only, no client-facing surface) specifically so Phase 3's actual remaining scope (portal, onboarding) is unaffected.

**Why:** Phase 2's kickoff brief specified this exact 2.1–2.8 structure with its own acceptance criteria per subphase and separate feature branches — reconciling the roadmap to match avoids two documents disagreeing about what's in flight.

---

## 2026-11-26 — Production branch reconciled to `master`; first Coolify deployment hardening

**Decision:** `master` is now the production branch (what Coolify deploys), per explicit instruction at the start of Phase 2. `main` (created during initial GitHub setup, Phase 1.1) still exists but is no longer used — not deleted, superseded.

**Context:** Between the Phase 1.1 session and this one, `master` received a direct commit (`d2cf8c5`, "env" — a one-line `docker-compose.yml` edit to the `migrate` service's `REDIS_URL`) and was pushed to `origin/master`, and a first real Coolify deployment was attempted and is now accessible. `develop` was one commit behind; it was fast-forwarded to match `master` before any further work, per instruction ("ensure develop includes the latest validated production fixes before starting").

**Deployment issues found and fixed** (the stated goal was that these must not recur):
1. **Environment variables.** `docker-compose.yml` no longer uses `env_file:` at all (Coolify's Compose env-var handling has a documented history of `env_file` entries being auto-injected/rescoped/overridden across its versions). Every variable each service needs is now explicit via `${VAR}` interpolation, which is the one mechanism Coolify's own docs describe as stable. Separately, a real latent bug was found: the `worker` imports the same `src/lib/env.ts` as `app` (for `REDIS_URL`), which eagerly validates the *entire* env schema on import — including the required, no-default `AUTH_SECRET` — so the worker would crash on startup without `AUTH_SECRET`/`APP_URL` set for it specifically, not just for `app`. Both are now explicitly declared on the `worker` service.
2. **Docker networking / Next.js standalone bind address.** Docker sets `HOSTNAME` to the container's own id in every container; Next's standalone `server.js` binds to `HOSTNAME` if set, so without an override the app was binding to its own container IP rather than `0.0.0.0` — reachable via Docker's host port-publishing NAT (which targets the container IP directly) but *not* via loopback from inside the container itself. Fixed with `ENV HOSTNAME=0.0.0.0` in the `app` Dockerfile stage. Confirmed via `/proc/net/tcp` inside the container before (bound to its own IP) and after (bound to `0.0.0.0`) the fix.
3. **Reverse-proxy domain assignment.** Documented explicitly (`docs/DEPLOYMENT.md` §4.1) that Coolify only domain-routes services with a `ports:` mapping — only `app` has one — and that the production domain/FQDN must be assigned to the `app` service alone in Coolify's UI, never to `worker`/`migrate`/`redis`.
4. **Database network isolation.** Documented the Coolify-specific fix: a separately-provisioned Database resource is on a different Docker network from a Compose resource by default; enable "Connect to Predefined Network" and use the database's Internal URL, not `localhost` or a guessed hostname. Also confirmed and documented: never add a custom top-level `networks:` block to the compose file — Coolify's own docs warn this causes intermittent HTTPS outages for Compose apps.
5. Added a Docker `HEALTHCHECK` to the `app` image (Node's built-in `fetch` against `/api/health` on `127.0.0.1` — no `curl`/`wget` needed in the alpine base), which is also what surfaced finding #2 above.

**Validated:** full local stack rebuilt (`pnpm docker:local up -d --build`) against these changes — app healthcheck passes, bind address confirmed `0.0.0.0:3000`, worker starts cleanly, `/api/health` ok, lint/typecheck/tests all pass. See `docs/IMPLEMENTATION_STATUS.md`.

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
