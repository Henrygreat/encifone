# Troubleshooting — EncifOne

Common deployment errors, their confirmed root cause, the fix (already implemented as of Phase 1.5 unless noted), and how to verify. See `docs/DECISION_LOG.md` for the full incident writeups and `docs/DEPLOYMENT.md` for the architecture these fixes assume.

**First step for anything below:** run `bash scripts/diagnose-deployment.sh <app-container-name> <domain>` on the server. It's read-only and reports container status, bind address, network attachments, env var names (never values), migration status, health, Traefik labels, and SSL status in one pass.

---

## 502 Bad Gateway

**Cause:** Next.js's standalone server binds to whatever `HOSTNAME` is set to; Docker sets it to the container's own id by default. The app ends up listening on one specific IP instead of all interfaces, so Traefik — connecting via a Docker network — can't always reach it, especially if the container is attached to more than one network.

**Fix:** `Dockerfile` sets `ENV HOSTNAME=0.0.0.0` in the `app` stage (confirmed: `/proc/net/tcp` inside the container shows `0.0.0.0:3000`, not a specific IP). `docker-compose.yml` sets it again at the compose level for belt-and-suspenders.

**Verify:** `docker exec <app-container> node -e "console.log(require('fs').readFileSync('/proc/net/tcp','utf8'))"` — the listening line's local address should start with `00000000`. Or just: `bash scripts/diagnose-deployment.sh` §2.

**If still happening after this fix is deployed:** it's a Coolify-side network/domain misconfiguration, not the app. Check:
- Coolify → the Compose resource's Advanced settings → is "Connect to Predefined Network" needed (if the app must also reach a database on a different Coolify destination) — see "Database connection errors" below for a different symptom, but network misconfiguration can also cause 502s on the app's own public domain.
- Coolify → the `app` service's domain field is actually set, and no other service in this stack also has a domain set.

---

## Prisma P1001 (can't reach database server)

**Cause:** almost always one of: (a) `DATABASE_URL` pointing at the wrong host (e.g. `localhost`, which inside a container means the container itself, not the database), (b) the app/migrate containers not being on the same Docker network as the database.

**Fix / check, in order:**
1. In Coolify, the Compose resource's Advanced → Docker Compose → Predefined Network must have **"Connect to Predefined Network"** enabled, pointed at the same destination the Postgres database resource runs on. A separately-provisioned Coolify database resource is on a *different* network from a Compose app resource by default — they don't share one automatically.
2. `DATABASE_URL` must be the database's **Internal URL** (shown on its resource page in Coolify — built from its container name + internal port), never its public/external URL, and never `localhost`.
3. Run `scripts/validate-env.sh` (also run automatically by `deploy-preflight.sh`) — it flags a `localhost`/`127.0.0.1` `DATABASE_URL` when `NODE_ENV=production`.

**Verify:** `bash scripts/diagnose-deployment.sh` §5 (migration status) and the readiness check (`curl .../api/health/ready` → `"database":"ok"`).

---

## PostgreSQL and application containers on different Docker networks

Same root cause and fix as the P1001 section above — this is the underlying condition, P1001 is the symptom you see in logs.

---

## Redis environment variable inconsistencies

**Cause (confirmed, fixed):** the `app`/`worker`/`migrate` services used to pull some variables from `env_file: .env`, and Coolify's own `env_file` auto-injection behaviour has changed across versions (sometimes merging, sometimes overriding with a single Coolify-managed file) — this could silently drop a variable for one service while it worked for another.

**Fix:** `docker-compose.yml` no longer uses `env_file:` at all. Every variable is explicit via `${VAR}` interpolation, which only depends on Coolify writing its UI-configured variables into a `.env` next to the compose file for YAML interpolation — the one behaviour Coolify's docs describe as stable across versions.

**Separately found:** the `worker` container needs `AUTH_SECRET` and `APP_URL` set too, even though it never uses them — it imports the same shared `src/lib/env.ts` as the app (for `REDIS_URL`), which validates the whole schema on import. If you add a new required variable to that schema, remember both `app` and `worker` need it in Coolify, not just `app`.

**Verify:** `bash scripts/validate-env.sh` inside each container, or `diagnose-deployment.sh` §4 (lists variable *names* present, never values).

---

## Missing runtime environment variables (generic)

Run `scripts/validate-env.sh` — sourced from an exported `.env` or run inside the target container — before every deploy (`deploy-preflight.sh` does this automatically). It never prints values, only which names are missing/malformed.

---

## Prisma migration checksum mismatches

**Cause:** a previously-applied migration file's content was changed after the fact (even a comment) — Prisma checksums the exact bytes. This happened once on this project from a repo-wide doc-link rename sweep that incidentally touched a migration file's comment. The only CLI-native "fix" (`prisma migrate reset`) wipes the database — never do that without explicit approval.

**Permanent fix:** CLAUDE.md rule 13 — applied migrations are never modified, for any reason, including comments. All schema changes go into new migration files. `scripts/check-migration-integrity.sh` runs in CI on every push/PR, checking every migration file against `prisma/migrations/checksums.json` (sourced from a real database's `_prisma_migrations` table — **not** from comparing against `master`/`develop`, since master/develop's own copy of this exact migration was found to be corrupted during the 2026-11-26 consolidation — see `docs/DECISION_LOG.md`). After creating and applying a new migration, run `DATABASE_URL=... bash scripts/check-migration-integrity.sh --record` and commit the updated manifest.

**If it happens anyway:** see `docs/DECISION_LOG.md`'s "Applied Prisma migrations are immutable" entry for the exact, non-destructive recovery procedure (revert the file's content to match its original checksum — including line endings, see the `.gitattributes` note below — rather than resetting).

**Related gotcha:** if your local git config has `core.autocrlf=true` (common on Windows), checking out a different branch can silently convert a migration file's line endings from LF to CRLF, which also breaks its checksum even with identical text. `.gitattributes` now forces `prisma/migrations/**/*.sql` to stay LF regardless of that setting.

---

## GitHub Actions lint and typecheck failures

Run `pnpm lint` and `pnpm typecheck` locally before pushing — CI runs the exact same commands, nothing CI-specific. If CI fails but these pass locally, check Node/pnpm version drift (`.github/workflows/ci.yml` pins Node 22; `package.json`'s `packageManager` field pins the pnpm version) and that your lockfile is committed and matches `package.json` (`pnpm install --frozen-lockfile` is what CI runs — it fails loudly on any mismatch, unlike plain `pnpm install`).

---

## Incorrect public domain assignment

**Cause:** by default, Coolify/Traefik only considers a service for domain routing if it has a `ports:` mapping in the compose file (as a discovery heuristic) — or, for Compose resources, whichever service(s) have a domain explicitly configured in Coolify's UI.

**Fix / check:**
- In Coolify's UI, on the Compose resource, the production domain must be assigned to the **`app`** service only. `redis`, `migrate`, and `worker` must show no domain.
- As of Phase 1.5, `app` has no `ports:` mapping in the production compose file at all (removed deliberately — see `docs/ROLLBACK.md` for why). If Coolify's domain-assignment UI for this service stops showing `app` as an option after this change, that's a real regression — this was not confirmed against a live Coolify instance before this file shipped (see `docs/IMPLEMENTATION_STATUS.md`'s pending-verification list). If that happens, the safe recovery is to temporarily restore the `ports: ["3000:3000"]` block in `docker-compose.yml` (revert that one hunk) and redeploy.

**Verify:** `bash scripts/diagnose-deployment.sh` §10 (Traefik labels) and §11 (public HTTPS + SSL, if you pass a domain).

---

## Missing NEXTAUTH_URL / `[next-auth][warn][NEXTAUTH_URL]`

**Cause (confirmed):** NextAuth v4 needs `NEXTAUTH_URL` to build correct callback/cookie URLs behind a reverse proxy; nothing in this project ever set it.

**Fix:** `src/lib/env.ts`'s `ensureNextAuthUrl()` defaults `process.env.NEXTAUTH_URL` from `APP_URL` if it's unset, imported before any NextAuth code runs (`src/lib/auth.ts`). You don't need to set `NEXTAUTH_URL` separately unless it must genuinely differ from `APP_URL`.

**Related, also fixed:** `src/lib/auth.ts` now explicitly passes `secret: env.AUTH_SECRET` to NextAuth's config — previously NextAuth was falling back to auto-detecting `process.env.NEXTAUTH_SECRET`, a variable this project never sets (its own name is `AUTH_SECRET`), which is almost certainly what caused the adjacent `UnauthenticatedError` symptom for users who should have had a valid session.

**Verify:** `bash scripts/deploy-verify.sh <url>` runs a full register → sign in → session → authenticated-API-call smoke test.

---

## Next.js binding to the Docker container hostname instead of all interfaces

This is the same root cause as "502 Bad Gateway" above — see that section.
