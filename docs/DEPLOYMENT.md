# Deployment — EncifOne

> Local Docker Compose deployment is implemented and verified (see `docs/IMPLEMENTATION_STATUS.md`). Coolify/production deployment is **not yet performed** — this section documents the approach to follow when it is.
>
> **EncifOne is Coolify-only.** There is no Vercel deployment, no Vercel-specific configuration, and nothing in the stack depends on a Vercel-only feature (Edge Config, KV, Blob, etc.) — see `CLAUDE.md`'s "Deployment target" rule.

## 1. Local development

- `docker compose up` — Postgres, Redis, app (dev mode), worker.
- `.env` from `.env.example`; env vars validated at process start (fail fast, not at first use).
- Prisma migrations applied automatically on container start in dev; explicit `prisma migrate deploy` step in CI/CD for staging/prod.

## 2. Environments

`local` → `staging` → `production`. Staging uses test-mode credentials for every payment/e-sign/AI provider so the full vertical slice (`docs/ROADMAP.md`) can be exercised without real charges.

## 3. Containers

- `app` — Next.js server (standalone output build).
- `worker` — same codebase, different entrypoint, running BullMQ processors.
- `postgres`, `redis` — standard images, named volumes for persistence.
- Reverse proxy (`Traefik` or `Nginx`) terminates TLS, routes to `app`; Cloudflare in front for DNS/CDN/WAF where used.

## 4. Coolify deployment

Standard `Dockerfile` + `docker-compose.yml` with no platform-specific extensions, so the stack deploys on Coolify or any Docker-host target without modification.

Readiness checklist (deployment itself is a deliberate later step — not performed yet):
- [x] `Dockerfile` builds `app` and `worker` targets independently; `docker compose up -d --build` verified locally (all four services healthy, migrations run automatically via the `migrate` one-shot service).
- [x] No Vercel-specific code, config, or env vars anywhere in the repo.
- [ ] Point a Coolify "Docker Compose" resource at this repository (private GitHub repo — Coolify authenticates via a deploy key/GitHub App, which is independent of this being a private repo).
- [ ] Set real environment variables in Coolify (never commit them) — see `.env.example` for the full list; at minimum `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` must be production values, not the dev defaults baked into `docker-compose.yml`.
- [ ] Confirm Coolify (or a fronting Cloudflare proxy) terminates HTTPS and forwards to the `app` service's port 3000 — the app itself doesn't terminate TLS.
- [ ] Confirm the `postgres_data`/`redis_data` named volumes are on persistent storage in Coolify's host, not ephemeral.
- [ ] Point Cloudflare DNS at the Coolify host/IP; Cloudflare proxy mode and Coolify-managed HTTPS (e.g. via Let's Encrypt) are both compatible with this setup out of the box.
- [ ] Wire the `migrate` service (or an equivalent Coolify deployment hook) to run before `app` starts on every deploy, as it does locally.

## 5. Source control & CI/CD

- **Repository:** https://github.com/Henrygreat/encifone (private).
- **Branches:** `main` (stable, tagged releases) ← merged from `develop` ← merged from `feature/*`/`hotfix/*`. See `CLAUDE.md` §"Git workflow".
- **CI** (`.github/workflows/ci.yml`, runs on push to `main`/`develop` and on every PR): install → lint → typecheck → `prisma validate` → `pnpm audit` (dependency security) → tests (against ephemeral Postgres/Redis service containers, no production credentials) → build. The `build` job only runs once lint/typecheck, security, and tests have all passed.
- **CD** (not yet implemented): on merge to `main`, build & push the image → trigger a Coolify deploy → the `migrate` service runs `prisma migrate deploy` → health check → rollback on failure.

## 6. Backups & recovery

- Automated daily Postgres backups (logical dump or provider snapshot) with a defined retention window; stored off the primary host.
- Documented restore procedure, tested periodically (see `docs/TESTING.md` §Backup/restore tests).
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
