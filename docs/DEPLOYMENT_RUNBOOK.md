# Deployment Runbook — EncifOne

Operational companion to `docs/DEPLOYMENT.md` (architecture/reference) — this is the step-by-step procedure. See `docs/TROUBLESHOOTING.md` if something goes wrong and `docs/ROLLBACK.md` for recovery.

## 1. One-time setup (manual — do this once per environment, not per deploy)

For a release containing communications changes, use the staging migration and provider checks in the [Phase 5.1 capstone](PHASE_5_1_CAPSTONE_REPORT.md#deployment). Confirm the configured public origin before installing chat or registering provider webhooks.

### 1.1 GitHub
- [ ] Branch protection on `master`: require the CI workflow's required jobs to pass, disallow force-push, disallow deletion. Exact steps in `docs/DEPLOYMENT.md` §"GitHub branch protection (one-time manual configuration)" — `gh` CLI was not available in this environment to apply it directly; apply via the GitHub UI or `gh api` once available.
- [ ] Confirm the `main` and `develop` branches (unused, superseded by the master-first workflow — `docs/DECISION_LOG.md`) have no deployment trigger pointed at them anywhere, in either GitHub or Coolify.
- [ ] Add the two deployment secrets under **Settings → Secrets and variables → Actions → New repository secret**:
  - `COOLIFY_WEBHOOK_URL` — the resource-specific deploy webhook URL, from Coolify's UI (§1.2 below).
  - `COOLIFY_WEBHOOK_TOKEN` — a Coolify API token with permission to deploy that resource (§1.2 below).
  Neither value is ever logged or echoed by `.github/workflows/ci.yml`'s `deploy` job — if either secret is missing, that job fails fast with an explicit error rather than silently skipping deployment.

### 1.2 Coolify
- [ ] Provision the PostgreSQL 18 + pgvector database resource. Confirm the `vector` extension is available. Confirm it is **not** publicly exposed.
- [ ] Create the Compose application resource, pointed at this repository, `master` branch, `docker-compose.yml` (the base file — never `docker-compose.local.yml`).
- [ ] Advanced → Docker Compose → **enable "Connect to Predefined Network"**, pointed at the same destination as the database resource. Without this, `app`/`worker`/`migrate` cannot reach it — see `docs/TROUBLESHOOTING.md`.
- [ ] Set the production domain on the **`app`** service only (not `redis`/`migrate`/`worker`).
- [ ] Confirm the compose file defines no custom top-level `networks:` block (it doesn't, as of this writing — Coolify's own docs warn this causes intermittent HTTPS outages for Compose apps).
- [ ] Set environment variables (§2 below) in Coolify's UI for this resource.
- [ ] Confirm `GIT_SHA` is passed as a build variable sourced from the deployed commit (so images are identifiable per `docs/ROLLBACK.md` §2) — **pending verification**: confirm how Coolify exposes the deploying commit SHA to the build environment for this specific resource type and wire it to `GIT_SHA`.
- [ ] Set resource limits / confirm Coolify's own container resource settings don't conflict with this repo's `deploy.resources.limits` in `docker-compose.yml`.
- [ ] **Disable Coolify's own automatic "deploy on push" trigger for this resource** (Application → Configuration/General — the exact label varies by Coolify version, e.g. "Auto Deploy"). This is required, not optional: deployment now happens exclusively through the GitHub Actions `deploy` job's webhook call once CI passes, and leaving Coolify's native trigger on at the same time would fire **two independent deployments** per push, racing each other.
- [ ] Generate the deploy webhook this application resource exposes (Application → Webhooks, or the API tab, depending on Coolify version) — copy its URL into the `COOLIFY_WEBHOOK_URL` GitHub secret (§1.1).
- [ ] Generate a Coolify API token (user Settings → Keys & Tokens, or the equivalent in your Coolify version) scoped to deploying this resource only if Coolify's token scopes support that granularity; otherwise use the narrowest token Coolify allows. Put it in the `COOLIFY_WEBHOOK_TOKEN` GitHub secret (§1.1). Rotate it the same way you'd rotate any other production credential if it's ever exposed.
- [ ] **Not yet verified against the live environment** (mark pending until tested end-to-end): that Coolify's webhook URL/token format matches exactly what `.github/workflows/ci.yml`'s `deploy` job sends (a `GET` request with `Authorization: Bearer <token>`) — Coolify's webhook API has changed shape across versions; confirm against the specific Coolify version in use and adjust the `curl` call in that job if it differs (e.g. some versions expect the token as a query parameter instead of a bearer header).

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

This is what happens automatically once `master` is updated — nothing here is a manual step, it's documenting the sequence so you can tell if it deviated:

1. A push to `master` runs the full `.github/workflows/ci.yml` pipeline: `lint-and-typecheck` → `migration-integrity` / `security` / `test` (parallel) → `build` → `docker-multi-network-test` / `docker-smoke-test`.
2. If and only if **every** job above succeeds, the `deploy` job runs: it calls the Coolify deploy webhook (`COOLIFY_WEBHOOK_URL` + `COOLIFY_WEBHOOK_TOKEN` secrets — §2 below). A `concurrency` group on this job means a second push's deployment queues behind one already in flight rather than overlapping it.
3. Coolify pulls `master` at the triggering commit and runs `docker compose build`, building `migrate`, `app`, `worker` images (`docker-compose.yml`'s `build:` blocks).
4. `migrate` runs once (`prisma migrate deploy`), must exit 0 before `app`/`worker` start (`depends_on: condition: service_completed_successfully`).
5. `app` and `worker` start; Coolify/Docker wait for `app`'s `HEALTHCHECK` (readiness: DB + Redis) before considering the deployment healthy and (if the zero-downtime conditions in `docs/ROLLBACK.md` §1 hold) swapping traffic over.

If any required CI job fails, the `deploy` job is skipped automatically (its `needs:` dependency isn't satisfied) — deployment never happens on a failing commit, and there is no manual step to forget here.

## 4. Manual pre-deploy and post-deploy steps (run by a human, not automated)

### Before pushing directly to `master`
```bash
git checkout master && git pull
bash scripts/deploy-preflight.sh
```
For a higher-risk change, use a short-lived `feature/<name>`/`fix/<name>` branch instead, open a PR into `master`, and let CI validate it there before merging — see `CLAUDE.md` §"Git workflow". Either way, never force-push and never bypass a failing CI check to get a merge or push through.

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

Mechanically: the same `docker-compose.yml` base file, deployed as a **second, independent** Coolify application resource, pointed at a specific `feature/*` branch for pre-merge testing instead of `master`, with its own database/Redis/domain/secrets configured per the above. No new compose file is needed — this is purely a second Coolify resource + its own environment variables. This second resource must **not** share the production `COOLIFY_WEBHOOK_URL`/`COOLIFY_WEBHOOK_TOKEN` secrets or deploy workflow — it is a manually-triggered Coolify resource, not wired into `.github/workflows/ci.yml`'s `deploy` job, which is master-only by design.

## 6. Branch → environment mapping (master-first, adopted 2026-11-26)

```
master (commit)  →  CI (all required jobs)  →  deploy job (CI-gated webhook)  →  Coolify → production

feature/<name> / fix/<name>  →  PR into master  →  CI validates the PR  →  merge  →  (above)
```

- `master` is the only branch with a Coolify deploy trigger — and that trigger is the CI-gated webhook, not Coolify's own native auto-deploy, which must be disabled (§1.2). `main`/`develop` are never deployed anywhere.
- The `.github/workflows/ci.yml` `deploy` job's `needs:` on every required job is the actual deployment gate: a failing check makes the job not run at all, not merely "allowed to be overridden." There is no path from a failing CI run to a live deployment short of someone manually disabling the gate in the workflow file itself — which is itself a change that would have to go through the same CI-gated `master` push to take effect.
- Branch protection on `master` (§1.1) is what prevents an unreviewed/untested push from reaching `master` in the first place; the CI-gated deploy job is what prevents a push that *does* land on `master` from deploying before it's validated. The two are complementary, not redundant.
