# Deployment — EncifOne

> Local Docker Compose deployment is implemented and verified (see `docs/IMPLEMENTATION_STATUS.md`). Coolify/production deployment is **not yet performed** — this section documents the approach to follow when it is.
>
> **EncifOne is Coolify-only.** There is no Vercel deployment, no Vercel-specific configuration, and nothing in the stack depends on a Vercel-only feature (Edge Config, KV, Blob, etc.) — see `CLAUDE.md`'s "Deployment target" rule.

## 1. Local development

Two compose files, used together — never deploy with the local one:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
# or: pnpm docker:local up -d --build
```

- `docker-compose.yml` (base) — `redis`, `migrate`, `app`, `worker`. No `postgres` service, no public Redis port: this is the same file Coolify deploys.
- `docker-compose.local.yml` (local-only override) — adds a local `postgres` (`pgvector/pgvector:pg18`) container on host port `5433` (configurable via `POSTGRES_HOST_PORT`) and republishes Redis on host port `6380` (`REDIS_HOST_PORT`), for direct `psql`/`redis-cli`/Prisma Studio access from the host.
- `.env` from `.env.example`; env vars validated at process start (fail fast, not at first use).
- Prisma migrations applied automatically by the `migrate` service on `up`; the same `prisma migrate deploy` command runs in CI/CD for staging/prod.

## 2. Environments

`local` → `staging` → `production`. Staging uses test-mode credentials for every payment/e-sign/AI provider so the full vertical slice (`docs/MASTER_ROADMAP.md`) can be exercised without real charges.

## 3. Containers

- `app` — Next.js server (standalone output build).
- `worker` — same codebase, different entrypoint, running BullMQ processors.
- `redis` — standard image, named volume for persistence. Defined in the base file (both environments); no host port published in the base file (not reachable from the public internet) — the local override adds one for host convenience only.
- `postgres` — **local development only** (`docker-compose.local.yml`). Image: `pgvector/pgvector:pg18`. Production does **not** run a Postgres container from this repo — see §4.
- Reverse proxy (`Traefik` or `Nginx`) terminates TLS, routes to `app`; Cloudflare in front for DNS/CDN/WAF where used.

### PostgreSQL 18 volume layout (important)

PostgreSQL's official Docker images changed their volume layout starting with major version 18: `PGDATA` moved to a version-specific subdirectory (`/var/lib/postgresql/18/docker`) and the image's declared `VOLUME` moved up to `/var/lib/postgresql` (previously `/var/lib/postgresql/data` for PG ≤17). `docker-compose.local.yml` mounts the new path (`postgres_data_pg18:/var/lib/postgresql`). **Never** reuse an old PG16 volume mounted at the old path with the `pg18` image — it will not see the old data and will silently initialise an empty cluster. See `docs/DECISION_LOG.md` and `docs/IMPLEMENTATION_STATUS.md` for how the existing local PG16 data was migrated.

## 4. Coolify deployment

Standard `Dockerfile` + `docker-compose.yml` (the base file — **not** `docker-compose.local.yml`) with no platform-specific extensions, so the stack deploys on Coolify or any Docker-host target without modification.

**Database:** production uses a **separately-provisioned Coolify-managed PostgreSQL 18 + pgvector instance** — this repository's compose files never define a production Postgres container, to avoid a duplicate/competing database. Point `DATABASE_URL` at that instance's connection string. The `vector` extension must be enabled on that instance (`CREATE EXTENSION IF NOT EXISTS vector;` — the app's own `migrate` service will do this automatically via `prisma/migrations/20261125124136_enable_pgvector` as long as the role has the privilege to create extensions; Coolify-managed Postgres instances typically grant this to the default superuser role).

Readiness checklist (deployment itself is a deliberate later step — not performed yet):
- [x] `Dockerfile` builds `app` and `worker` targets independently; the full stack (including the local Postgres 18 + pgvector override) verified locally — all services healthy, migrations run automatically via the `migrate` one-shot service.
- [x] No Vercel-specific code, config, or env vars anywhere in the repo.
- [x] Base `docker-compose.yml` defines no Postgres container and publishes no port for Redis — confirmed via `docker compose -f docker-compose.yml config`.
- [ ] Provision the Coolify-managed PostgreSQL 18 + pgvector database resource; confirm the `vector` extension is available (`pgvector/pgvector:pg18`-equivalent image on Coolify's side) and the connection is **not** exposed publicly.
- [ ] Point a Coolify "Docker Compose" resource at this repository's `docker-compose.yml` (private GitHub repo — Coolify authenticates via a deploy key/GitHub App, independent of the repo being private).
- [ ] Set real environment variables in Coolify (never commit them) — see `.env.example` for the full list; at minimum `DATABASE_URL` (pointing at the Coolify-managed Postgres above), `REDIS_URL`, `AUTH_SECRET` must be production values.
- [ ] Confirm Coolify (or a fronting Cloudflare proxy) terminates HTTPS and forwards to the `app` service's port 3000 — the app itself doesn't terminate TLS.
- [ ] Confirm the `redis_data` named volume is on persistent storage in Coolify's host, not ephemeral, and that the Coolify-managed Postgres instance has its own backup/persistence configuration.
- [ ] Point Cloudflare DNS at the Coolify host/IP; Cloudflare proxy mode and Coolify-managed HTTPS (e.g. via Let's Encrypt) are both compatible with this setup out of the box.
- [ ] Wire the `migrate` service (or an equivalent Coolify deployment hook) to run before `app` starts on every deploy, as it does locally.

## 5. Source control & CI/CD

- **Repository:** https://github.com/Henrygreat/encifone (private).
- **Branches:** `main` (stable, tagged releases) ← merged from `develop` ← merged from `feature/*`/`hotfix/*`. See `CLAUDE.md` §"Git workflow".
- **CI** (`.github/workflows/ci.yml`, runs on push to `main`/`develop` and on every PR): install → lint → typecheck → `prisma validate` → `pnpm audit` (dependency security) → tests (against ephemeral Postgres/Redis service containers, no production credentials) → build. The `build` job only runs once lint/typecheck, security, and tests have all passed.
- **CD** (not yet implemented): on merge to `main`, build & push the image → trigger a Coolify deploy → the `migrate` service runs `prisma migrate deploy` → health check → rollback on failure.

## 6. Backups & recovery

- Automated daily Postgres backups (logical dump or provider snapshot) with a defined retention window; stored off the primary host. For the Coolify-managed PostgreSQL 18 instance, use Coolify's own scheduled backup feature for that database resource once provisioned.
- Documented restore procedure, tested periodically (see `docs/TESTING.md` §Backup/restore tests). The PG16→PG18 local migration (`docs/IMPLEMENTATION_STATUS.md`) exercised this exact procedure: `pg_dump -Fc` → new volume/container → `pg_restore` → row-count/migration-history validation → old volume retained, untouched, pending explicit approval to delete.
- Target RPO ≤ 24h, RTO documented once a concrete hosting provider is chosen (Phase 1 task).

## 7. Observability

- `/api/health` checks DB, Redis, queue connectivity, and reports provider degradation (e.g. AI provider unreachable) without failing the whole health check unnecessarily.
- Structured JSON application logs (request id, org id where applicable, actor, action).
- Error monitoring via a Sentry-compatible SDK from Phase 1 onward.

## 8. Secrets management

- Environment variables for all credentials; no secrets committed to the repo (`.env` is gitignored, `.env.example` lists keys with placeholder values only).
- Integration credentials (`IntegrationCredential`) encrypted at the application layer before being stored in Postgres.

## 9. Scaling path

Horizontal scale of stateless `app`/`worker` containers first → Postgres read replica(s) → dedicated worker fleet sizing independent of app tier → (only if justified) split a specific hot module into its own service. Kubernetes is not planned until a concrete, measured scaling need exceeds what Compose + a small fleet of VPS/managed-container instances can handle.
