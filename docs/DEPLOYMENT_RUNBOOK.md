# Deployment Runbook — EncifOne

Operational companion to `docs/DEPLOYMENT.md` (architecture/reference) — this is the step-by-step procedure. See `docs/TROUBLESHOOTING.md` if something goes wrong and `docs/ROLLBACK.md` for recovery.

## 1. One-time setup (manual — do this once per environment, not per deploy)

### 1.1 GitHub
- [ ] Branch protection on `master`: require the CI workflow's required jobs to pass, disallow force-push, disallow deletion. Exact steps in `docs/DEPLOYMENT.md` §"GitHub branch protection (one-time manual configuration)" — `gh` CLI was not available in this environment to apply it directly; apply via the GitHub UI or `gh api` once available.
- [ ] Confirm the `main` branch (unused, superseded by `master` — `docs/DECISION_LOG.md`) has no deployment trigger pointed at it anywhere.

### 1.2 Coolify
- [ ] Provision the PostgreSQL 18 + pgvector database resource. Confirm the `vector` extension is available. Confirm it is **not** publicly exposed.
- [ ] Create the Compose application resource, pointed at this repository, `master` branch, `docker-compose.yml` (the base file — never `docker-compose.local.yml`).
- [ ] Advanced → Docker Compose → **enable "Connect to Predefined Network"**, pointed at the same destination as the database resource. Without this, `app`/`worker`/`migrate` cannot reach it — see `docs/TROUBLESHOOTING.md`.
- [ ] Set the production domain on the **`app`** service only (not `redis`/`migrate`/`worker`).
- [ ] Confirm the compose file defines no custom top-level `networks:` block (it doesn't, as of this writing — Coolify's own docs warn this causes intermittent HTTPS outages for Compose apps).
- [ ] Set environment variables (§2 below) in Coolify's UI for this resource.
- [ ] Confirm `GIT_SHA` is passed as a build variable sourced from the deployed commit (so images are identifiable per `docs/ROLLBACK.md` §2) — **pending verification**: confirm how Coolify exposes the deploying commit SHA to the build environment for this specific resource type and wire it to `GIT_SHA`.
- [ ] Set resource limits / confirm Coolify's own container resource settings don't conflict with this repo's `deploy.resources.limits` in `docker-compose.yml`.
- [ ] Confirm Coolify's own deployment trigger is set to `master` only — **verify this directly in Coolify's settings, not just via GitHub branch protection** (branch protection controls merging; it does not, by itself, control what Coolify deploys — see `docs/DEPLOYMENT.md` §"Branch strategy enforcement").

### 1.3 Cloudflare (if used in front of Coolify)
- [ ] DNS record for the production domain points at the Coolify host.
- [ ] Proxy mode and Coolify-managed HTTPS (Let's Encrypt) — both compatible by design, no special configuration needed beyond a correct DNS record.

## 2. Required environment variables (set once in Coolify's UI, per environment)

See `.env.example` for the full annotated list and classification. At minimum, for **both** `app` and `worker` (the worker needs `AUTH_SECRET`/`APP_URL` too — `docs/DECISION_LOG.md`):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | The database resource's **Internal URL**, never public/external, never `localhost`. |
| `AUTH_SECRET` | 16+ random characters. Different per environment (never reuse a dev secret in production). |
| `APP_URL` | The real `https://` production domain. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — omit entirely to leave Google sign-in disabled. |

`REDIS_URL`, `HOSTNAME`, `PORT`, `NODE_ENV` are hardcoded in `docker-compose.yml` already — do not set them in Coolify (see that file's comments for why, particularly `NEXTAUTH_URL`, which must **not** be set with an empty fallback).

## 3. Every deployment (the automated part)

This is what happens automatically once `master` is updated and Coolify's deploy trigger fires — nothing here is a manual step, it's documenting the sequence so you can tell if it deviated:

1. Coolify pulls `master` at the triggering commit.
2. `docker compose build` builds `migrate`, `app`, `worker` images (`docker-compose.yml`'s `build:` blocks).
3. `migrate` runs once (`prisma migrate deploy`), must exit 0 before `app`/`worker` start (`depends_on: condition: service_completed_successfully`).
4. `app` and `worker` start; Coolify/Docker wait for `app`'s `HEALTHCHECK` (readiness: DB + Redis) before considering the deployment healthy and (if the zero-downtime conditions in `docs/ROLLBACK.md` §1 hold) swapping traffic over.

## 4. Manual pre-deploy and post-deploy steps (run by a human, not automated)

### Before promoting `develop` → `master`
```bash
git checkout develop && git pull
bash scripts/deploy-preflight.sh   # set EXPECT_BRANCH=develop if run from develop
```
Open a PR from `develop` to `master`. CI must pass. Review. Merge (never force-push, never auto-merge without review — CLAUDE.md §"Git workflow").

### After Coolify finishes deploying `master`
```bash
bash scripts/deploy-verify.sh https://<your-production-domain>
```
This runs the full smoke test (liveness, readiness, public pages, protected-route rejection, and a real register → sign-in → session → authenticated-API-call round trip) against the live URL. If anything fails, go to `docs/TROUBLESHOOTING.md` before touching Coolify's configuration.

If something looks wrong but you're not sure what:
```bash
bash scripts/diagnose-deployment.sh <app-container-name> <your-production-domain>
```
Run this directly on the Hetzner host (needs `docker` access). Entirely read-only.

## 5. Staging (design — not provisioned; do not create a live staging deployment without explicit approval)

A staging environment should mirror production's Docker Compose configuration exactly, differing only in:
- A separate database (never a copy of production customer data — seed it independently).
- A separate Redis instance (or a clearly separated logical namespace if sharing infrastructure were ever considered — not recommended; prefer a fully separate instance).
- Separate `AUTH_SECRET`, separate `APP_URL`/domain.
- Every third-party integration (Stripe, email, AI providers) pointed at its own test/sandbox mode or simply left unconfigured (`docs/DEPLOYMENT.md` §6 — optional integrations must not block startup when absent) so staging activity never reaches a real customer, a real payment, or a real inbox.

Mechanically: the same `docker-compose.yml` base file, deployed as a **second, independent** Coolify application resource, pointed at `develop` (or a specific `feature/*` branch for pre-merge testing) instead of `master`, with its own database/Redis/domain/secrets configured per the above. No new compose file is needed — this is purely a second Coolify resource + its own environment variables.

## 6. Branch → environment mapping (enforced by convention + Coolify's deploy-trigger setting, not by this repo's files alone)

```
feature/*  →  develop  →  CI  →  PR + review  →  master  →  Coolify (production)
```

- `develop` and `feature/*` are never auto-deployed anywhere by default in this setup — only `master` has a Coolify deploy trigger (confirm this directly in Coolify's settings — §1.2).
- A failed CI run on a PR blocks merge (once branch protection is configured — §1.1); it does **not**, by itself, stop Coolify from deploying `master` if something were pushed there directly bypassing review. Keeping `master` protected (§1.1) is what actually prevents that — the CI status check alone is not a deployment gate unless branch protection requires it before merge.
