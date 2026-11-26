# Deployment — EncifOne

> Local Docker Compose deployment is implemented and verified (see `docs/IMPLEMENTATION_STATUS.md`). A first Coolify production deployment has been attempted and is accessible; it surfaced the issues §4 now documents fixes and guardrails for (Docker build errors, environment-variable issues, database network isolation, incorrect reverse-proxy domain assignment). §4 is written to prevent each of those recurring — read it in full before any further deploy.
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

**Database:** production uses a **separately-provisioned Coolify-managed PostgreSQL 18 + pgvector instance** — this repository's compose files never define a production Postgres container, to avoid a duplicate/competing database. The `vector` extension must be enabled on that instance (`CREATE EXTENSION IF NOT EXISTS vector;` — the `migrate` service does this automatically via `prisma/migrations/20261125124136_enable_pgvector`, as long as its role can create extensions; Coolify-managed Postgres instances typically grant this to the default role).

### 4.1 Avoiding each problem category hit on the first deployment attempt

**Docker build errors**
- The build stage (`Dockerfile` `builder` target) sets placeholder `DATABASE_URL`/`REDIS_URL`/`AUTH_SECRET` values purely so `next build` succeeds without a real database — these are never used at runtime. If a build fails on something else, check `.dockerignore` isn't excluding a file the build actually needs, and that Coolify's build timeout/memory is sufficient for a Next.js build (give it at least 2GB RAM during build).
- The `app` image now has a `HEALTHCHECK` (via Node's built-in `fetch` against `/api/health` on `127.0.0.1` — no `curl`/`wget` needed in the alpine base). If Coolify shows the app container as unhealthy, check its logs first — don't assume the healthcheck itself is broken (it was fixed once already; see next point).

**Environment variable issues** — the actual root causes found and fixed here:
1. Coolify's Docker Compose env-var handling has a documented history (its own issue tracker) of `env_file` entries being auto-injected into every service, then changed to per-service scoped files, with at least one reported bug where a repo's own `env_file:` entries get overridden by a single Coolify-managed one instead of merging. This repo's `docker-compose.yml` no longer uses `env_file:` **at all** — every variable each service needs is declared explicitly via `environment: KEY: ${KEY}`, which relies only on Coolify's one documented, stable mechanism: it writes a `.env` next to the compose file from its UI-configured variables, purely for `${VAR}` interpolation in the YAML. This is the one thing Coolify guarantees works the same way regardless of `env_file`-handling version churn.
2. **The `worker` needs `AUTH_SECRET` and `APP_URL` even though it never uses them.** `src/workers/index.ts` imports `@/lib/env`, which eagerly validates the *entire* shared env schema (including the no-default, required `AUTH_SECRET`) the moment that module is imported — so the worker crashes on startup if those two aren't set for it specifically, not just for `app`. Both are now explicitly declared in the `worker` service's `environment:` block. **When setting env vars in Coolify's UI, make sure `AUTH_SECRET` and `APP_URL` are available to the `worker` service, not only `app`.**
3. Required vars with no default, which must be set for the relevant services: `DATABASE_URL` (migrate, app, worker), `AUTH_SECRET` (app, worker — 16+ chars), `APP_URL` (app, worker — a full URL, e.g. `https://your-domain.example`). `REDIS_URL` is hardcoded to the internal service address (`redis://redis:6379`) in the compose file itself and should **not** be set as an environment variable in Coolify at all.

**Database network isolation**
- A Coolify "Database" resource and a Coolify "Docker Compose" application resource are on **separate Docker networks by default** — they do not share a network just because they're in the same Coolify project. To fix: on the Compose resource's **Advanced → Docker Compose → Predefined Network** setting, enable **"Connect to Predefined Network"** and select the destination the database resource runs on.
- Once connected, use the database's **Internal URL** (shown on the database resource's page in Coolify — built from its container name, internal port, and credentials) as `DATABASE_URL`. Do **not** use `localhost`, the database's public/external URL, or a guessed hostname.
- Do **not** add a custom top-level `networks:` block to `docker-compose.yml` — Coolify's own documentation warns this causes intermittent HTTPS outages for Compose-deployed apps, since it conflicts with the network Coolify manages for the resource. (Confirmed: no custom `networks:` key exists in this repo's compose files — keep it that way.)

**Incorrect reverse-proxy domain assignment**
- By default, Coolify (via Traefik) only considers a service for domain/HTTPS routing if it has a `ports:` mapping in the compose file. Only `app` has one (`3000:3000`) — `redis`, `migrate`, and `worker` do not, and must not be given one.
- In Coolify's UI, on the Compose resource, set the production **domain/FQDN explicitly on the `app` service only** (per-service domain field, or `SERVICE_FQDN_APP` if you want Coolify to generate one). Leave the domain field empty for `redis`, `migrate`, and `worker` — they should have **no public domain at all**.
- After deploying, verify in Coolify's UI that exactly one service (`app`) shows an assigned domain, and that `worker`/`migrate`/`redis` show none.

### 4.2 Readiness checklist
- [x] `Dockerfile` builds `app` and `worker` targets independently; the full stack (including the local Postgres 18 + pgvector override) verified locally — all services healthy, migrations run automatically via the `migrate` one-shot service, `app`'s `HEALTHCHECK` passes.
- [x] No Vercel-specific code, config, or env vars anywhere in the repo.
- [x] Base `docker-compose.yml` defines no Postgres container, publishes no port for Redis, defines no custom `networks:` block, and uses no `env_file:` directive.
- [x] Every variable each service needs is explicit in `docker-compose.yml` (§4.1) — including `AUTH_SECRET`/`APP_URL` on `worker`.
- [ ] Provision the Coolify-managed PostgreSQL 18 + pgvector database resource; confirm the `vector` extension is available and the connection is **not** exposed publicly.
- [ ] Enable "Connect to Predefined Network" on the Compose resource and use the database's Internal URL for `DATABASE_URL` (§4.1).
- [ ] Set environment variables in Coolify per §4.1 point 3 — on **both** `app` and `worker` where listed.
- [ ] Assign the production domain to the `app` service only (§4.1) — confirm `worker`/`migrate`/`redis` have none.
- [ ] Confirm Coolify (or a fronting Cloudflare proxy) terminates HTTPS and forwards to the `app` service's port 3000.
- [ ] Confirm the `redis_data` named volume is on persistent storage in Coolify's host, not ephemeral, and that the Coolify-managed Postgres instance has its own backup/persistence configuration.
- [ ] Point Cloudflare DNS at the Coolify host/IP; Cloudflare proxy mode and Coolify-managed HTTPS (e.g. via Let's Encrypt) are both compatible with this setup out of the box.
- [ ] Wire the `migrate` service (or an equivalent Coolify deployment hook) to run before `app` starts on every deploy, as it does locally.

## 5. Source control & CI/CD

- **Repository:** https://github.com/Henrygreat/encifone (private).
- **Branches:** `master` is the production branch (what Coolify deploys) ← merged from `develop` ← merged from `feature/*`/`hotfix/*`. See `CLAUDE.md` §"Git workflow" and `docs/DECISION_LOG.md` for the reconciliation of `master` vs. the `main` branch created during initial GitHub setup (`main` still exists, unused — not deleted).
- **CI** (`.github/workflows/ci.yml`, runs on push to `master`/`develop` and on every PR): install → lint → typecheck → `prisma validate` → `pnpm audit` (dependency security) → tests (against ephemeral Postgres/Redis service containers, no production credentials) → build. The `build` job only runs once lint/typecheck, security, and tests have all passed.
- **CD** (not yet implemented): on merge to `master`, build & push the image → trigger a Coolify deploy → the `migrate` service runs `prisma migrate deploy` → health check → rollback on failure.

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
