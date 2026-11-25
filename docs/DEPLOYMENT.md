# Deployment — EncifOne

> Not yet executable — this documents the planned deployment approach for Phase 1 scaffolding to implement against.

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

## 4. Coolify compatibility

Standard `Dockerfile` + `docker-compose.yml` with no platform-specific extensions, so the stack deploys on Coolify or any Docker-host target without modification.

## 5. CI/CD (GitHub Actions)

Pipeline stages: install → lint → typecheck → unit/integration tests → build → (on merge to main) build & push image → deploy → run `prisma migrate deploy` → health check → rollback on failure.

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
