# Deployment — EncifOne

> Local Docker Compose deployment is implemented and verified (see `docs/IMPLEMENTATION_STATUS.md`). A first Coolify production deployment has been attempted and is accessible; it surfaced the issues §4 documents fixes and guardrails for. §4 is written to prevent each of those recurring — read it in full before any further deploy.
>
> **This is the architecture/reference document.** For the step-by-step procedure, see `docs/DEPLOYMENT_RUNBOOK.md`. For error → cause → fix lookup, see `docs/TROUBLESHOOTING.md`. For rollback/recovery, see `docs/ROLLBACK.md`. For the full incident record behind every fix below, see `docs/DECISION_LOG.md`.
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
- The `app` image has a `HEALTHCHECK` (Node's built-in `fetch` against `/api/health/ready` on `127.0.0.1` — no `curl`/`wget` needed in the alpine base) and the `worker` image has one too (a heartbeat-file freshness check, since it has no HTTP port to probe — `src/workers/index.ts`). If Coolify shows a container as unhealthy, check its logs first — don't assume the healthcheck itself is broken.
- `--build-arg GIT_SHA=$(git rev-parse HEAD)` is passed by `docker-compose.yml` (via the `GIT_SHA` build arg, sourced from an exported `GIT_SHA` env var wherever `docker compose build` runs) and baked into `/app/GIT_SHA` in every image, for version identification — see `docs/ROLLBACK.md` §2.

**Next.js network binding (the confirmed leading root cause of the 502/Bad Gateway incident)**
- Docker sets `HOSTNAME` to the container's own id/hostname in every container by default; Next's standalone `server.js` binds to `HOSTNAME` if it's set, which meant the app was bound to one specific interface IP instead of all of them — reachable via Docker's host port-publishing NAT, but not reliably via every Docker network the container is attached to (confirmed against source: `src/.next/standalone/server.js`'s behaviour, and empirically via `/proc/net/tcp` inside the container before/after the fix).
- **Fixed in two places, belt-and-suspenders:** `Dockerfile` sets `ENV HOSTNAME=0.0.0.0` in the `app` stage, and `docker-compose.yml` sets `HOSTNAME: "0.0.0.0"` again at the compose level. `PORT=3000` is likewise explicit in both places rather than left to Next's implicit default.
- If this regresses, `bash scripts/diagnose-deployment.sh <app-container>` §2 shows the container's actual listening interfaces — `0.0.0.0:<port>` is correct, a specific IP is the bug.

**Authentication behind the reverse proxy (`NEXTAUTH_URL` warning / `UnauthenticatedError`)**
- NextAuth v4 was never given an explicit `secret` — it was falling back to auto-detecting `process.env.NEXTAUTH_SECRET`, a variable this project never sets (its own name is `AUTH_SECRET`). `src/lib/auth.ts` now passes `secret: env.AUTH_SECRET` explicitly.
- `NEXTAUTH_URL` was never set at all, which NextAuth v4 needs to build correct callback/cookie URLs behind Traefik. `src/lib/env.ts`'s `ensureNextAuthUrl()` defaults it from `APP_URL` as a documented side effect, imported before any auth code runs. Set `NEXTAUTH_URL` separately in Coolify only if it must genuinely differ from `APP_URL` — see the comment in `docker-compose.yml`'s `app` service for why it must never be set with an empty-string fallback.
- Secure cookies are issued correctly once `NEXTAUTH_URL`/`APP_URL` is a real `https://` URL — NextAuth v4 decides `useSecureCookies` from that scheme.

**Environment variable issues** — the actual root causes found and fixed here:
1. Coolify's Docker Compose env-var handling has a documented history (its own issue tracker) of `env_file` entries being auto-injected into every service, then changed to per-service scoped files, with at least one reported bug where a repo's own `env_file:` entries get overridden by a single Coolify-managed one instead of merging. This repo's `docker-compose.yml` no longer uses `env_file:` **at all** — every variable each service needs is declared explicitly via `environment: KEY: ${KEY}`, which relies only on Coolify's one documented, stable mechanism: it writes a `.env` next to the compose file from its UI-configured variables, purely for `${VAR}` interpolation in the YAML. This is the one thing Coolify guarantees works the same way regardless of `env_file`-handling version churn.
2. **The `worker` needs `AUTH_SECRET` and `APP_URL` even though it never uses them.** `src/workers/index.ts` imports `@/lib/env`, which eagerly validates the *entire* shared env schema (including the no-default, required `AUTH_SECRET`) the moment that module is imported — so the worker crashes on startup if those two aren't set for it specifically, not just for `app`. Both are now explicitly declared in the `worker` service's `environment:` block. **When setting env vars in Coolify's UI, make sure `AUTH_SECRET` and `APP_URL` are available to the `worker` service, not only `app`.**
3. Required vars with no default, which must be set for the relevant services: `DATABASE_URL` (migrate, app, worker), `AUTH_SECRET` (app, worker — 16+ chars), `APP_URL` (app, worker — a full URL, e.g. `https://your-domain.example`). `REDIS_URL` is hardcoded to the internal service address (`redis://redis:6379`) in the compose file itself and should **not** be set as an environment variable in Coolify at all.

**Database network isolation**
- A Coolify "Database" resource and a Coolify "Docker Compose" application resource are on **separate Docker networks by default** — they do not share a network just because they're in the same Coolify project. To fix: on the Compose resource's **Advanced → Docker Compose → Predefined Network** setting, enable **"Connect to Predefined Network"** and select the destination the database resource runs on.
- Once connected, use the database's **Internal URL** (shown on the database resource's page in Coolify — built from its container name, internal port, and credentials) as `DATABASE_URL`. Do **not** use `localhost`, the database's public/external URL, or a guessed hostname.
- Do **not** add a custom top-level `networks:` block to `docker-compose.yml` — Coolify's own documentation warns this causes intermittent HTTPS outages for Compose-deployed apps, since it conflicts with the network Coolify manages for the resource. (Confirmed: no custom `networks:` key exists in this repo's compose files — keep it that way.)

**Incorrect reverse-proxy domain assignment**
- In Coolify's UI, on the Compose resource, set the production **domain/FQDN explicitly on the `app` service only** (per-service domain field, or `SERVICE_FQDN_APP` if you want Coolify to generate one). Leave the domain field empty for `redis`, `migrate`, and `worker` — they should have **no public domain at all**.
- After deploying, verify in Coolify's UI that exactly one service (`app`) shows an assigned domain, and that `worker`/`migrate`/`redis` show none.
- As of Phase 1.5, `app` has **no `ports:` mapping** in the production compose file (removed deliberately — see `docs/ROLLBACK.md` §1 for why: Coolify's zero-downtime blue-green redeploy/rollback needs a health check — `app` has one — *and* no published host port). Coolify's own historical docs describe using a `ports:` mapping as a heuristic for *discovering* which services can get a domain in its UI; this project's production diagnostics already showed Traefik routing to `app` via the Docker network rather than a published host port, so removing it should not affect an *already-configured* domain assignment — but this specific change has **not been verified against the live Coolify instance** (see `docs/IMPLEMENTATION_STATUS.md`'s pending list). If Coolify's domain field for `app` becomes unselectable after this ships, the safe recovery is to revert this one hunk (restore `ports: ["3000:3000"]` on `app` in `docker-compose.yml`) and redeploy — `docker-compose.local.yml` already carries its own copy of that mapping for local dev regardless.

### 4.2 Readiness checklist

See `docs/MASTER_ROADMAP.md` Phase 1.5 for the full acceptance criteria. Summary:
- [x] `Dockerfile` builds `app` and `worker` targets independently, non-root (`USER node`), with `HEALTHCHECK`s and baked-in `GIT_SHA`; the full stack (including the local Postgres 18 + pgvector override) verified locally — all services healthy, migrations run automatically via the `migrate` one-shot service.
- [x] No Vercel-specific code, config, or env vars anywhere in the repo.
- [x] Base `docker-compose.yml` defines no Postgres container, publishes no port for Redis **or `app`**, defines no custom `networks:` block, and uses no `env_file:` directive. Resource limits set per service (`deploy.resources.limits`).
- [x] Every variable each service needs is explicit in `docker-compose.yml` (§4.1) — including `AUTH_SECRET`/`APP_URL` on `worker`.
- [x] `NEXTAUTH_URL`/NextAuth `secret` fixed (§4.1) — verified via a full register/sign-in/session/authenticated-API smoke test locally and in CI (`docker-smoke-test` job).
- [x] CI now includes a migration-integrity check, Compose config validation, a multi-network binding reproduction test, and a smoke test against the actual production Docker images (`.github/workflows/ci.yml`) — see `docs/TESTING.md`.
- [ ] *(pending live verification — cannot be confirmed from this environment)* Provision the Coolify-managed PostgreSQL 18 + pgvector database resource; confirm the `vector` extension is available and the connection is **not** exposed publicly.
- [ ] *(pending)* Enable "Connect to Predefined Network" on the Compose resource and use the database's Internal URL for `DATABASE_URL` (§4.1).
- [ ] *(pending)* Set environment variables in Coolify per §4.1 — on **both** `app` and `worker` where listed.
- [ ] *(pending)* Assign the production domain to the `app` service only (§4.1) — confirm `worker`/`migrate`/`redis` have none, and confirm the domain field for `app` is still selectable now that it has no `ports:` mapping.
- [ ] *(pending)* Confirm Coolify (or a fronting Cloudflare proxy) terminates HTTPS and forwards to the `app` service.
- [ ] *(pending)* Confirm the `redis_data` named volume is on persistent storage in Coolify's host, not ephemeral, and that the Coolify-managed Postgres instance has its own backup/persistence configuration — see `docs/ROLLBACK.md` §4.
- [ ] *(pending)* Point Cloudflare DNS at the Coolify host/IP.
- [ ] *(pending)* Confirm Coolify's deployment trigger is actually scoped to `master` only (not inferred from branch protection alone) — `docs/DEPLOYMENT_RUNBOOK.md` §1.2.
- [ ] *(pending)* Run `scripts/deploy-verify.sh <production-url>` against the live site after the next deploy.

## 5. Source control & CI/CD

- **Repository:** https://github.com/Henrygreat/encifone (private).
- **Branches:** `master` is the production branch (what Coolify deploys) ← merged from `develop` ← merged from `feature/*`/`hotfix/*`. See `CLAUDE.md` §"Git workflow" and `docs/DECISION_LOG.md` for the reconciliation of `master` vs. the `main` branch created during initial GitHub setup (`main` still exists, unused — not deleted).
- **CI** (`.github/workflows/ci.yml`, runs on push to `master`/`develop` and on every PR, no production credentials anywhere): `lint-and-typecheck` (+ `prisma validate` + Compose config validation) → `migration-integrity` (checks every migration against the checksum manifest it was recorded with when actually applied — `scripts/check-migration-integrity.sh`, `prisma/migrations/checksums.json`) → `security` (`pnpm audit`) → `test` (unit + integration against ephemeral Postgres 18 + pgvector/Redis) → `build` (needs all of the above) → `docker-multi-network-test` (builds the real `app` image, attaches it to two Docker networks, asserts it's reachable through both — the exact scenario that caused the production incident) → `docker-smoke-test` (builds and runs the real `migrate`/`app`/`worker` images against ephemeral services, then a full register/sign-in/session/authenticated-API-call round trip, then checks the worker's heartbeat file). See `docs/TESTING.md`.
- **CD** (not yet implemented): on merge to `master`, Coolify's own deploy trigger builds & deploys — see `docs/DEPLOYMENT_RUNBOOK.md` for the full sequence and what's manual vs. automated.

## 6. Backups & recovery

Full detail in `docs/ROLLBACK.md`. Summary: automated backups for the Coolify-managed PostgreSQL 18 instance via Coolify's own scheduled-backup feature (provisioning + enabling this is pending live verification); a backup is not "verified" until it has actually been test-restored at least once — the local PG16→PG18 migration (`docs/DECISION_LOG.md`, 2026-11-25) exercised that exact procedure. Database rollback is kept strictly separate from application rollback — never automatic, always a manually-approved decision (CLAUDE.md rule 9).

## 7. Observability & health checks

- **`/api/health/live`** — process liveness only, no dependency checks (never fails due to a slow database).
- **`/api/health/ready`** — Postgres + Redis connectivity, each with a bounded 3s timeout (`src/lib/health.ts`); this is what the `app` image's `HEALTHCHECK` and Coolify should treat as "may receive traffic."
- **`/api/health`** — kept for backward compatibility, same behaviour as `/ready`.
- The `worker` image has its own `HEALTHCHECK` — a heartbeat file (`src/workers/index.ts`) touched every 15s, considered stale (and thus unhealthy) after 45s with no update. It has no HTTP port to probe.
- Graceful shutdown: the worker catches `SIGTERM`/`SIGINT`, lets any in-flight BullMQ job finish, then closes its Redis connection before exiting — not an abrupt kill on every redeploy.
- Structured JSON application logs (request id, org id where applicable, actor, action) — not yet implemented beyond `console.log`/`console.error`; tracked as a gap, not claimed as done.
- Error monitoring via a Sentry-compatible SDK — not yet wired up (`SENTRY_DSN` in `.env.example` is a placeholder for this).

## 8. Secrets management & build/runtime separation

- Environment variables for all credentials; no secrets committed to the repo (`.env` is gitignored, `.gitattributes`/`.dockerignore` keep it and `backups/` out of any build context; `.env.example` lists every key with a classification — build-time/runtime/optional/dev-only/secret — and placeholder values only).
- **Builds never touch a real database, Redis instance, or third-party credential.** The `Dockerfile`'s `builder` stage sets fixed, non-secret placeholder values for `DATABASE_URL`/`REDIS_URL`/`AUTH_SECRET` purely so `next build`'s env validation passes — `prisma generate` only needs the schema file, not a live connection (`prisma.config.ts` reads `process.env.DATABASE_URL` directly, not the `env()` helper, specifically so a missing value doesn't throw during a build-only `prisma generate`). No AI/payment/accounting/communication provider credential is ever read at build time — those are all read lazily, per call site, at runtime only, and their absence must not block startup (`.env.example` "Optional integrations" classification).
- Integration credentials (`IntegrationCredential`) will be encrypted at the application layer before being stored in Postgres once that model is built (not yet implemented — no integration credentials are stored anywhere yet).
- Images run as the non-root `node` user (both `app` and `worker` stages, `Dockerfile`).

## 9. Scaling path & resource limits

- `docker-compose.yml` sets `deploy.resources.limits` per service as a conservative starting point for a modest VPS (`docs/MASTER_ROADMAP.md` §5): `app` 1 CPU/1GB, `worker` 0.5 CPU/512MB, `migrate` 0.5 CPU/512MB (transient), `redis` 0.5 CPU/256MB. Tune based on actual usage — these are not derived from load testing.
- Horizontal scale of stateless `app`/`worker` containers first → Postgres read replica(s) → dedicated worker fleet sizing independent of app tier → (only if justified) split a specific hot module into its own service. Kubernetes is not planned until a concrete, measured scaling need exceeds what Compose + a small fleet of VPS/managed-container instances can handle.

## 10. Branch strategy enforcement (one-time manual GitHub/Coolify configuration)

Full step-by-step in `docs/DEPLOYMENT_RUNBOOK.md` §1.1–§1.2. This repository cannot configure GitHub branch protection or Coolify's deploy trigger from its own files — both require one-time manual setup in each platform's UI (or `gh api`, not available in this working environment). Required outcomes:
- `master` protected: CI's required jobs must pass before merge, no force-push, no deletion.
- Coolify's deploy trigger for the production app resource is explicitly scoped to `master` — confirmed **directly in Coolify's settings**, not inferred from GitHub branch protection (which governs merging, not deployment).
- `develop` never auto-deploys anywhere; `develop` is never auto-merged into `master`.
