# Rollback & Recovery — EncifOne

## 1. What Coolify's rollback actually does (and doesn't)

Researched against Coolify's own documentation (not assumed): Coolify can redeploy a previously-built image for an application — Application → Deployments → pick an earlier deployment → Rollback. This re-deploys that image using Coolify's **current** runtime configuration (env vars, domain, etc. as configured now, not as they were at that deployment).

**Hard limitations, not a choice this project can design around:**
- Only images still present on the server's Docker host can be rolled back to — once an old image is pruned to reclaim disk space, it's no longer a rollback target. Your image-retention/cleanup policy on the Coolify host *is* your actual recovery window.
- Rollback redeploys the **application image only**. It does **not** reverse database migrations, does **not** restore persistent volumes, and does **not** touch any external service (Stripe, email provider, etc.) — see §3.
- Zero-downtime (old container stays up, serving traffic, until the new one passes its health check) requires a health check on the service (this project's `app` image has one — see `docs/DEPLOYMENT.md` §9) **and no published host port** on that service. This is why `docker-compose.yml`'s `app` service has no `ports:` mapping as of Phase 1.5 (see `docs/DECISION_LOG.md`) — with one published, Coolify can't bind the new container to the same host port until the old one is removed, forcing a brief gap instead of a clean blue-green cutover.
- "Only commit and pull-request image tags support rollback; the running image cannot be selected [as a target itself]" — in practice: don't rely on rolling back to "whatever's currently running," always roll back to a specific prior deployment shown in Coolify's list.

**Not yet verified against the live environment** (mark pending until tested): that this project's specific Compose setup actually exhibits zero-downtime blue-green behaviour end-to-end. Test this deliberately (e.g. deploy a trivial change, watch Coolify's deployment log and `curl` the app in a tight loop from another terminal) before relying on it during a real incident.

## 2. Identifying what's deployed

Every image built by this project's `Dockerfile` bakes in the git commit SHA it was built from, at `/app/GIT_SHA` inside the container (set via `--build-arg GIT_SHA=$(git rev-parse HEAD)` — `docker-compose.yml` passes this through automatically if `GIT_SHA` is exported in the build environment; Coolify should be configured to export it from the commit it's deploying).

```bash
docker exec <app-container> cat /app/GIT_SHA
```

`scripts/diagnose-deployment.sh` reports this (§12) alongside the image name and creation time.

## 3. Application rollback vs. database rollback — kept strictly separate

**Never automatically reverse a database migration as part of an application rollback.** Rolling back the app to an older image while the database has since been migrated forward is usually *fine* — Prisma migrations in this project are additive (new tables/columns), so an older app version simply doesn't know about newer columns/tables and ignores them. Rolling the **database** back is a different, much higher-risk operation that needs its own explicit decision:

1. **Check compatibility first.** Before rolling the app back, confirm the target app version's expected schema (its `prisma/migrations` at that commit) is a **subset** of what's currently applied — i.e. you're rolling back to an older app that expects an earlier (or equal) schema, not one that needs a migration that was since rolled back. `git show <target-sha>:prisma/migrations` lists what that version expected.
2. **Database rollback requires a verified backup, full stop.** Never restore a database backup without first confirming (a) the backup is recent enough to be useful, and (b) a dry-run restore has actually been tested (see §4). This is a destructive, hard-to-reverse action — treat it as requiring the same explicit, scoped approval as any other destructive database operation (CLAUDE.md rule 9).
3. **Default assumption: roll back the app only.** Reserve a database restore for when the application rollback alone doesn't resolve the incident (e.g. a migration itself corrupted data, not just introduced a bug).

## 4. Database backup verification

For the Coolify-managed PostgreSQL 18 + pgvector instance: use Coolify's own scheduled backup feature for that database resource (configure this — not yet confirmed as configured; mark pending verification). A backup that has never been test-restored is not a verified backup — periodically (e.g. quarterly, or before a major schema change) restore the latest backup into a scratch database and run `scripts/check-migration-integrity.sh`-style sanity checks plus a manual row-count spot check against known tables, the same procedure already exercised once for the local PG16→PG18 migration (`docs/DECISION_LOG.md`, 2026-11-25).

## 5. When manual approval is required (not automatic, ever)

- Restoring a database backup.
- Any `prisma migrate reset`, `DROP`, or `TRUNCATE` against a non-scratch database.
- Deleting a previously-retained Docker image that is the last remaining rollback target for a given deployment.
- Force-pushing or rewriting history on `master`/`develop`.

## 6. Recovery runbook (incident in progress)

1. Run `scripts/diagnose-deployment.sh <app-container> <domain>` — read-only, safe to run immediately, tells you container status/health/network/migration state in one pass.
2. If the app container is unhealthy/crash-looping but the previous deployment was healthy: use Coolify's Rollback (§1) to the last known-good deployment. This does not touch the database.
3. Run `scripts/deploy-verify.sh <url>` against the rolled-back instance to confirm it's actually serving correctly (not just "container is up").
4. Only if rollback doesn't resolve it: investigate whether a database-level issue is the actual cause (§3) before considering a database restore — and if so, that's a separate, manually-approved decision, not a default next step.
5. Document what happened and the fix in `docs/DECISION_LOG.md` once resolved — this project treats that file as the durable incident record, not just a design-decision log.

## 7. Zero-downtime — a claim this project does not make yet

This document describes the *conditions* Coolify needs for zero-downtime rollback/redeploy (health check + no published port, both now true for `app`). It does not claim zero-downtime is demonstrated — that requires an actual test against the live environment (§1), which has not been performed as of this writing. Do not represent deployments as zero-downtime until that test has actually been run.
