# Implementation Status — EncifOne

_Last updated: 2026-11-26_

> Rebranded from the working name "ClientOS AI" to **EncifOne** during the GitHub-integration pass (see "GitHub integration & branding" below). No database tables, Docker volumes, migration files, or other internal identifiers were renamed as part of this — see that section for exactly what was and wasn't touched, and why.

## GitHub integration & branding

- **Repository:** https://github.com/Henrygreat/encifone — connected as `origin`. The remote was empty when connected (no pre-existing commits/branches), so the full local history was pushed directly; nothing was force-pushed or overwritten.
- **Branching (as of this 2026-11-25 pass — superseded 2026-11-26, see "Master-first Git workflow consolidation" below):** `main` (stable/production-ready, tagged releases) and `develop` (ongoing integration) both existed and tracked their remotes at this point; `feature/*` and `hotfix/*` were the conventions for new work. `CLAUDE.md` §"Git workflow" now describes the current master-first model, not this one.
- **Tag `v0.1.0`** marks the Phase 1 foundation commit on `main` — its acceptance criteria (below) were verified before tagging.
- **Rebrand:** "ClientOS AI" → **EncifOne**, centralised in `src/config/branding.ts` and propagated to page metadata, auth pages, the sidebar header, worker logs, and all documentation.
- **Deliberately left unchanged** (to avoid data loss / unnecessary churn): the Docker Compose project name (`clientos-ai` — renaming it would create new Docker volumes and orphan the existing Postgres data directory), the Postgres role/database name (`clientos`) already initialised in that volume, the active-org cookie key (`clientos_active_org` — an internal, never user-visible identifier), and every Prisma model name and the existing migration folder/file. None of these are customer-facing branding.
- **CI additions for this pass:** `prisma validate` (schema-only, no DB needed) and a `pnpm audit --audit-level high` job, both gating the `build` job. Neither requires production credentials or touches a production database — see the comment at the top of `.github/workflows/ci.yml`.
- **Dependency security:** a high-severity transitive advisory (`effect`, pulled in via `prisma`/`@prisma/config`) was fixed with a pinned override in `pnpm-workspace.yaml` (`overrides: effect: ^3.22.1`). One moderate advisory remains (`minimatch` via `shadcn`'s CLI tooling, dev-only, not part of the runtime bundle) — accepted as non-blocking; revisit if `shadcn` ships a fix.

## Current phase: Phase 1 — Foundations & scaffolding (complete)

### Completed and verified

**Scaffolding & infra**
- Next.js 16 (App Router, TypeScript strict) + Tailwind v4 + shadcn/ui (Radix UI base) + Lucide icons.
- PostgreSQL via Prisma 7 (pg driver adapter — see `prisma.config.ts` / `src/lib/prisma.ts`), Redis via ioredis, BullMQ worker process.
- Docker Compose: production-safe base (`docker-compose.yml`: `redis`, `migrate`, `app`, `worker` — no Postgres container) + local override (`docker-compose.local.yml`: adds `postgres` on `pgvector/pgvector:pg18`) — **verified**: `pnpm docker:local up -d --build` brings up all five services from a clean build, migrations run automatically via the `migrate` one-shot service, `/api/health` reports both Postgres and Redis reachable. See "Phase 1.1" below for the PostgreSQL 18 + pgvector standardisation.
- Multi-stage `Dockerfile` producing a standalone Next.js runtime image and a separate worker image.
- GitHub Actions CI (`.github/workflows/ci.yml`): dependency install, lint, typecheck, Prisma schema validation, dependency security audit, test (with Postgres/Redis service containers + migration), build. No job uses production credentials or a production database.
- Environment validation at boot (`src/lib/env.ts`, zod-based, fails fast on missing/malformed config).

**Identity & multi-tenancy**
- Auth: email/password (NextAuth v4 Credentials provider, bcrypt-hashed passwords) + optional Google OAuth (enabled when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set). MFA is schema-stubbed only (`User.mfaEnabled`) — no TOTP enrolment/challenge flow yet.
- Organisation creation at registration; a user can create additional organisations they own.
- 14 baseline `MembershipRole`s modelled; role-based capability checks in `src/core/permissions.ts` (Phase 1 capability set: view/manage members, update org settings).
- Multi-org membership + org switching: `requireActiveMembership()` always re-verifies the active-org cookie against the database before trusting it — never trusts a client-supplied organisation id (see `docs/SECURITY.md` §3).
- Member invitation flow: creates a pending (`INVITED`) membership with a token; **no email delivery is wired up yet** — the invite link is returned directly in the API response for the inviting admin to share manually. `/accept-invite` activates the membership and sets the invited user's password.
- Append-only `AuditLog` — written on organisation creation, membership creation/invite/accept.

**App shell UI**
- Marketing landing stub, `/login`, `/register`, `/accept-invite` pages.
- Authenticated app shell: collapsible sidebar (full planned IA from `docs/PRODUCT_REQUIREMENTS.md` §6, with unimplemented items rendered as disabled "Planned" rows — never dead links/buttons), org switcher (with create-new-org dialog), user menu, light/dark theme toggle, a working ⌘K/Ctrl+K command palette (navigation to the real pages + sign out only).
- `/dashboard`: real org data (name, active member count, currency, creation date) plus explicitly-labelled "not available yet" widgets for KPIs that depend on later phases.
- `/members` ("Organisation Settings"): real member list + invite dialog, backed by the API.

**Tests**
- `tests/unit/permissions.test.ts` — role→capability matrix.
- `tests/integration/tenant-isolation.test.ts` — against a real Postgres database: cross-org switch rejection, `listMembers` never leaking another org's rows, invite permission enforcement (`ForbiddenError` for an under-privileged role), and the full invite → accept-invite → active-membership path. 9/9 tests passing.
- Manually exercised the full Phase 1 acceptance journey end-to-end via the running app (register → create a second org → switch between them with visibly different member lists → invite a second user with a different role → that user can view but not invite → cross-tenant org-switch attempt rejected with 403).

### Phase 1 acceptance criteria — status

All four criteria from `docs/MASTER_ROADMAP.md` Phase 1 are met:
1. ✅ Register, create an org, invite a second user with a different role, switch between two orgs with visibly different data scoping.
2. ✅ Cross-tenant API access is rejected (automated test + manual verification).
3. ✅ `docker compose up` brings up app+DB+Redis+worker from a clean build; migrations run automatically.
4. ✅ Lint, typecheck, test, and build all pass clean.

## Phase 1.1 — Database standardisation: PostgreSQL 18 + pgvector (complete)

Full decision record: `docs/DECISION_LOG.md`. This supersedes all prior PostgreSQL 16/17 configuration.

### Compatibility assessment
- **Prisma 7.10.1** has no known blocking incompatibility with PostgreSQL 18 for a schema-first workflow (confirmed empirically — see Validation below). One caveat: Prisma's schema-engine `prisma db pull` (introspection) has a reported panic against some PG18 `NOT NULL` constraint metadata, fixed in Prisma ORM 8. This project never runs `db pull` (schema-first, not introspection-first), so it isn't hit in normal use — noted as a constraint on future tooling choices, not a blocker.
- **pgvector 0.8.7** ships pre-built in the `pgvector/pgvector:pg18` image — confirmed available via `pg_available_extensions` and successfully enabled via `CREATE EXTENSION IF NOT EXISTS vector;` (migration `20261125124136_enable_pgvector`).
- **No dependency version bumps were required** in `package.json`/`prisma.config.ts` — only the Docker image tag and the compose volume mount path changed.
- Prisma's own current guidance (as of this pass) is to manage Postgres extensions via a plain SQL migration rather than the now-deprecated `postgresqlExtensions` preview feature — that's the approach used here.

### Safe database migration (local)
1. **Backup:** `pg_dump -Fc` and a plain-SQL dump of the existing PG16 database, taken while it was still running on its original (`postgres:16-alpine`) container/volume. Stored at `backups/clientos_pg16_backup_20261125.{dump,sql}` (gitignored — never committed). Integrity verified via `pg_restore --list` (44 TOC entries, all 8 expected tables present).
2. **New volume:** `docker-compose.local.yml` defines a brand-new `postgres_data_pg18` volume, mounted at `/var/lib/postgresql` (PG18's new volume layout — see `docs/DEPLOYMENT.md` §3) — **never** the old PG16 volume or its old `.../data` mount path.
3. **Restore:** the PG16 dump was restored into the fresh, empty PG18 container via `pg_restore`. Row counts (`User`, `Organisation`, `Membership`, `AuditLog`) and the `_prisma_migrations` history table were compared before and after — identical in both cases (the project currently has 0 real users/orgs/memberships and 24 `AuditLog` rows from earlier testing; the procedure is the same regardless of data volume).
4. **New migration applied on top:** `20261125124136_enable_pgvector` was created and applied *after* the restore, so it appends cleanly to the existing (preserved) migration history rather than conflicting with it.
5. **Old database retained:** the original container was stopped (not removed); its volume (`clientos-ai_postgres_data`) and both backup files still exist on disk, untouched. **Not deleted — awaiting explicit approval**, per instruction.

### Docker / Coolify configuration
- `docker-compose.yml` (base) now defines **no Postgres service at all** — production uses a separately-provisioned Coolify-managed PostgreSQL 18 + pgvector instance via `DATABASE_URL`, so there's no duplicate/competing production Postgres container. Redis in the base file publishes no host port (reachable only from other containers on the compose network).
- `docker-compose.local.yml` (new file) adds the local `postgres` (`pgvector/pgvector:pg18`) service and republishes the existing local ports (`5433` Postgres, `6380` Redis) for host-side tooling (psql, Prisma Studio, redis-cli) — unchanged from before.
- `app`/`worker`/`migrate` read `DATABASE_URL`/`REDIS_URL` from the environment with no hardcoded database host in the base file; the local override supplies the local connection string. Verified via `docker compose -f docker-compose.yml config` (no `postgres` service, no Redis port published) and the merged local config (`-f docker-compose.yml -f docker-compose.local.yml config`) resolving correctly to the local Postgres/Redis.
- `pnpm docker:local` script added as shorthand for `docker compose -f docker-compose.yml -f docker-compose.local.yml`.
- `.github/workflows/ci.yml`'s ephemeral test-database service container also moved to `pgvector/pgvector:pg18`, with an explicit step asserting the extension is enabled — CI never touches a persistent volume or production database either way.

### Validation — all passed, against the restored PostgreSQL 18 + pgvector database
- ✅ Database connectivity (`/api/health` → `{"database":"ok","redis":"ok"}`)
- ✅ `prisma validate` (schema valid)
- ✅ Database migrations (`20261125105100_init` + new `20261125124136_enable_pgvector`, both applied; history preserved from the PG16 restore)
- ✅ pgvector extension availability (`pg_extension` shows `vector 0.8.7` enabled)
- ✅ Authentication (register + credentials sign-in against the new database)
- ✅ Organisation management (create org, create a second org, org switcher)
- ✅ Tenant isolation (cross-tenant org-switch attempt rejected with 403)
- ✅ Background worker connectivity (`[worker] EncifOne worker ready, listening on queue 'system'`, connected to the same Redis/Postgres)
- ✅ Automated tests (9/9 passing — unit + real-database integration)
- ✅ Linting (clean)
- ✅ Type checking (clean)
- ✅ Production Docker build (`pnpm docker:local up -d --build` — app/worker/migrate images build and run against PG18) and standalone `pnpm build` (clean)

### Not started (everything outside Phase 1 scope)

No CRM, sales, proposals, projects, finance, helpdesk, AI, or any other domain module exists yet — see `docs/MASTER_ROADMAP.md` Phase 2 onward. The dashboard, sidebar, and command palette intentionally show these as "Planned," not implemented.

## Pre-Phase-2 audit & production deployment hardening (complete)

Full record: `docs/DECISION_LOG.md` (2026-11-26 entry). Performed before any Phase 2 feature code, per the mandatory pre-development audit.

- **Git/branch reconciliation:** production branch is now `master` (not `main` — see Decision Log); `develop` fast-forwarded to include `master`'s one-ahead commit before starting.
- **Production deployment status:** a first Coolify deployment has been attempted and is accessible. It surfaced real issues, all now fixed and guarded against in `docs/DEPLOYMENT.md` §4: Coolify `env_file` fragility (removed — compose now uses only explicit `${VAR}` interpolation), a latent bug where the background worker would crash without `AUTH_SECRET`/`APP_URL` set (it imports the same env-validation module as the app), the Next.js standalone server binding to its container's own IP instead of `0.0.0.0` (fixed via `ENV HOSTNAME=0.0.0.0`), and explicit guidance on Coolify's database-network-isolation and reverse-proxy-domain-assignment behaviour.
- **Verified again post-hardening:** full local stack rebuild, `app` container `HEALTHCHECK` passes (confirmed bind address `0.0.0.0:3000` via `/proc/net/tcp`), worker starts cleanly, `/api/health` ok, lint/typecheck/tests (9/9) all pass.
- **Phase 1 feature completeness reconfirmed** before starting Phase 2: all four Phase 1 acceptance criteria above still hold; nothing was found to have regressed.

## Phase 1.5 — Production Infrastructure Hardening & Deployment Reliability (implementation complete; merged into `master` 2026-11-26; live-environment items pending)

Full record: `docs/DECISION_LOG.md` (2026-11-26 entries). Originally built on `feature/phase-1.5-infra-hardening`, based on `develop` (kept separate from `feature/phase-2.1-crm`'s in-progress CRM work, per instruction at the time). **Since merged into `master`** via the master-first consolidation (see the section below) — approved 2026-11-26. No Coolify deployment has been triggered yet and no production data has been touched; that remains blocked on live Coolify configuration the user must complete — see that section for exactly what's done vs. pending.

### Root causes confirmed and fixed
1. Next.js standalone binding to the container's own hostname instead of `0.0.0.0` — the fix existed on `develop` since Phase 1.1 but had never reached `master`/production (only unrelated direct "env" commits had). Re-confirmed via `/proc/net/tcp` inside a running container, before/after.
2. NextAuth v4 was never given an explicit `secret` (`src/lib/auth.ts`) — it was silently falling back to an unset `NEXTAUTH_SECRET`. Fixed.
3. `NEXTAUTH_URL` was never set — fixed via a code-level default from `APP_URL` (`src/lib/env.ts`), not a duplicated env var.
4. `PORT` was implicit — now explicit everywhere.

### What was built/changed (all verified locally, see below — not just written)
- Split health checks: `/api/health/live`, `/api/health/ready` (bounded 3s timeouts), `/api/health` kept as a backward-compatible alias.
- Worker heartbeat file + graceful `SIGTERM`/`SIGINT` handling (`src/workers/index.ts`).
- `Dockerfile`: explicit `PORT`, improved `HEALTHCHECK`s (app → `/api/health/ready`; worker → heartbeat freshness), non-root `node` user in both runtime stages, `GIT_SHA` build-arg baked into `/app/GIT_SHA` for version tracking.
- `docker-compose.yml`: `NODE_ENV`/`HOSTNAME`/`PORT` explicit at the compose level too; `deploy.resources.limits` per service; **`app`'s published host port removed** (moved to `docker-compose.local.yml` only) — see Decision Log for the evidence behind this change and what's still unverified about it.
- `.env.example` fully rewritten with a build-time/runtime/optional/dev-only/secret classification.
- `.gitattributes` (new) — forces LF on `prisma/migrations/**/*.sql` to stop `core.autocrlf` from silently breaking migration checksums (this had already happened twice — see Decision Log).
- `scripts/validate-env.sh`, `deploy-preflight.sh`, `deploy-verify.sh`, `diagnose-deployment.sh`, `check-migration-integrity.sh` — all non-destructive, none print secret values, all actually executed and their output verified during this work.
- `.github/workflows/ci.yml`: added `migration-integrity`, Compose config validation, `docker-multi-network-test` (reproduces the exact production incident), `docker-smoke-test` (runs the real production images end-to-end, including a full auth round trip).
- New docs: `docs/DEPLOYMENT_RUNBOOK.md`, `docs/TROUBLESHOOTING.md`, `docs/ROLLBACK.md`. Updated: `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_LOG.md`, `CLAUDE.md` (rule 13, already added in an earlier pass this session).

### Validated (against the rebuilt local stack, after every change — not only at the end)
- ✅ `app` and `worker` containers both report Docker-`healthy` (confirmed the worker heartbeat mechanism actually works, not just that it doesn't crash).
- ✅ Bind address confirmed `0.0.0.0:3000` via `/proc/net/tcp` inside the container.
- ✅ All three health endpoints respond correctly (`/live`, `/ready`, legacy `/api/health`).
- ✅ Full auth round trip: register → sign in → session reflects the user → authenticated API call succeeds — with the explicit `secret` fix in place (this is what the `UnauthenticatedError`/`NEXTAUTH_URL` warning symptoms map to).
- ✅ Unauthenticated access to a protected page/API returns a clean redirect/401, never a 500.
- ✅ `scripts/check-migration-integrity.sh` tested against both a clean state (passes) and a deliberately tampered commit (correctly fails) — not just run once and assumed correct.
- ✅ `scripts/deploy-preflight.sh`, `deploy-verify.sh`, `diagnose-deployment.sh` all executed against the live local stack and their output reviewed, including a caught-and-fixed bug in the diagnostic script itself (a leftover buggy debug line) and in `validate-env.sh`'s HOSTNAME check (bash's own ambient `$HOSTNAME` leaking through when run on a bare host shell — fixed by adding `HOSTNAME=0.0.0.0`/`PORT=3000` to the local `.env`).
- ✅ Lint, typecheck, automated tests (9/9), local build, and full Docker stack build all pass.
- ✅ `GIT_SHA` build-arg confirmed to bake correctly (explicit value and the "unknown" default both tested).
- ✅ Resource limits confirmed applied (`docker inspect` shows the configured CPU/memory quotas on the running container).

### Explicitly NOT done, by instruction
- Not merged into `master` or `develop`. No Coolify deployment triggered. No production database touched, reset, or had data modified. No migration file deleted. No `master`/`develop` branch force-pushed or deleted. No `main` branch deleted (still exists, unused). No staging environment actually provisioned (designed only — `docs/DEPLOYMENT_RUNBOOK.md` §5). GitHub branch protection and Coolify's deploy-trigger scope were **not** configured directly (`gh` CLI unavailable in this environment) — exact manual steps documented instead.

### Pending — requires access to the live Coolify/production environment to verify
These cannot be confirmed from this working environment; `docs/DEPLOYMENT.md` §4.2 and `docs/DEPLOYMENT_RUNBOOK.md` §1 list them as explicit checklist items:
- Whether removing `app`'s published host port affects Coolify's ability to (re)assign its domain in the UI.
- Whether the "Connect to Predefined Network" + Internal URL guidance actually resolves the live database-connectivity issue (it matches Coolify's documented behaviour, but hasn't been tested against this project's actual Coolify instance).
- Whether Coolify's zero-downtime blue-green redeploy/rollback is actually demonstrated end-to-end (the documented *conditions* for it are now met — health check + no port mapping — but the behaviour itself hasn't been observed live; `docs/ROLLBACK.md` §7 is explicit that this isn't claimed yet).
- GitHub branch protection rules and Coolify's deploy-trigger scope (both require manual platform configuration).
- Whether `GIT_SHA` is actually wired into Coolify's build environment from the commit it deploys.

## Master-first Git workflow consolidation (2026-11-26, awaiting approval to merge)

Full record: `docs/DECISION_LOG.md`. Branch: `integration/master-consolidation`, created from `master`. **Not merged into `master`, no default-branch change, no branches deleted, no Coolify deployment triggered, no production data touched — awaiting explicit approval**, per instruction.

### What this consolidated
- `develop`, `feature/phase-1.5-infra-hardening`, and `feature/phase-2.1-crm` merged into `integration/master-consolidation` (three merge commits; one conflict, in `docs/DECISION_LOG.md`, resolved by keeping all three entries). `main` confirmed to carry no unique commits beyond what `master` already has.
- Backup tags created before any merging: `backup/main-20261126`, `backup/master-20261126`, `backup/develop-20261126`, `backup/feature-phase-1.5-infra-hardening-20261126`, `backup/feature-phase-2.1-crm-20261126`. A further tag, `backup/master-pre-consolidation-20261126`, was created for `master`'s own tip immediately before merging `integration/master-consolidation` into it.

### Real CI bugs found and fixed (not pre-existing-knowledge — each root-caused from the actual GitHub Actions run via the public check-runs annotations API, then reproduced locally before fixing)
1. **`lint-and-typecheck` failure**: `src/app/layout.tsx` used Next's ambient `LayoutProps<"/">` type, generated only into the gitignored `.next/types/` directory by `next dev`/`next build` — CI's typecheck job never builds first, so a clean checkout genuinely lacks it (passed locally only because a prior `next dev` run had left it on disk). Fixed by typing the prop explicitly with `ReactNode` instead of depending on a generated file. Verified by removing `.next/types` locally and re-running `pnpm typecheck`/`pnpm build` clean.
2. **`migration-integrity` false positive**: confirmed to be exactly the already-diagnosed corrupted-file state — `origin/master`/`origin/develop` never received either prior checksum-incident fix. Resolved by the `checksums.json` manifest redesign (sourced from a live database's `_prisma_migrations` table, not from comparing against another branch).
3. **`docker-multi-network-test` failure**: initially suspected flaky, but reproduced locally and found to be a real logic bug — the port-binding check read `/proc/net/tcp`'s slot-index column instead of its local-address column, so it only ever passed by coincidence (when the app's LISTEN socket happened to be the first row) and could fail — as it did here — even when genuinely bound to `0.0.0.0:3000`, simply because a leftover connection from the job's own preceding health-check curls shifted row order. This is the exact regression check for the 502 Bad Gateway incident and was silently non-functional; fixed to parse the real address field, verified against real container output for both the old (fails) and new (passes) logic.

### Migration integrity — verified to actually protect, not just rubber-stamp
Per explicit instruction, manually tested (not just read) that `scripts/check-migration-integrity.sh` rejects tampering with an already-applied migration: (a) appending a byte to `20261125105100_init/migration.sql` → correctly fails; (b) deleting that migration's directory outright → **a real gap was found here**: the script only ever walked directories present on disk, so deleting an already-applied migration passed silently. Fixed by adding a pass that walks every name recorded in `checksums.json` and fails if its file no longer exists. Re-verified all three properties (tamper → fails, delete → fails, clean/restored → passes) after the fix.

### Git workflow simplified to master-first (`CLAUDE.md` §"Git workflow" rewritten)
`master` is now the single long-lived branch for both development and production. `main`/`develop` are kept, unused, as historical references — no new work targets them. `.github/workflows/ci.yml`'s push trigger is `[master]` only (the temporary `integration/master-consolidation` entry added mid-session purely to get a real CI signal without a `gh`-authenticated PR has been removed now that it's served its purpose).

### CI-gated production deployment added (not yet exercised against a live Coolify instance)
A `deploy` job in `.github/workflows/ci.yml`: runs only on a direct push to `master`, gated by `needs:` on every required job (lint/typecheck, migration-integrity, security, test, build, both Docker jobs), calls Coolify's deploy webhook via `curl` using two GitHub Actions secrets (`COOLIFY_WEBHOOK_URL`, `COOLIFY_WEBHOOK_TOKEN` — never printed, including the response body), and carries a `concurrency: { group: production-deploy, cancel-in-progress: false }` block so overlapping pushes queue their deployments instead of racing. Documented in `docs/DEPLOYMENT_RUNBOOK.md` §1.1–§1.2/§2: the exact secrets to add, and the exact Coolify-side change required (disable Coolify's own native "deploy on push" for this resource, since leaving it on alongside the webhook would cause two independent deployments per push). The webhook request shape (`GET` + `Authorization: Bearer`) matches Coolify's documented API but has **not been verified against this project's live Coolify instance** — flagged as pending the same way every other live-environment item in this file is.

### Status update (2026-11-26, approved)
**Merged into `master`** (merge commit, `--no-ff`, no force-push; backup tag `backup/master-pre-consolidation-20261126` on master's pre-merge tip). Still explicitly NOT done: the GitHub default branch has not been changed (requires repo-admin permissions this session doesn't have — manual steps provided to the user), no branch has been deleted, no Coolify deployment has been triggered (real or test — blocked on live Coolify credentials this session doesn't have), no production database has been touched, and no CI check was ever bypassed, disabled, or weakened — every failure found was root-caused and fixed in the check itself.

## Known limitations

- **No email delivery.** Invite links must be shared manually. This blocks any real multi-user onboarding until an email provider (Resend/Postmark) is wired up — planned alongside Phase 2's proposal/contract flows.
- **MFA is a schema stub only** — no enrolment or challenge UI.
- **Prisma 7 config** moved the datasource URL out of `schema.prisma` into `prisma.config.ts` / the `PrismaPg` adapter (a breaking change from earlier Prisma majors) — if upgrading Prisma further, re-check `https://pris.ly/d/prisma7-client-config` for further changes.
- **`cacheComponents` (Next 16's PPR successor) is disabled** in `next.config.ts` — this app is session/tenant-scoped on nearly every route, which doesn't fit a prerendering-first model. Revisit only if a genuinely static, cacheable surface (e.g. the future marketing site) needs it.
- Local dev Postgres/Redis ports are remapped (5433/6380) in `docker-compose.local.yml` to avoid colliding with other local stacks — adjust `POSTGRES_HOST_PORT`/`REDIS_HOST_PORT` if that still collides for you.
- The old PostgreSQL 16 volume (`clientos-ai_postgres_data`) and its backup files (`backups/`) are still on disk, retained pending explicit approval to delete — see "Phase 1.1" above.
- Tenant-isolation automated tests exercise the service layer (the actual enforcement point behind every route) rather than full HTTP requests against a running server; the HTTP-level behaviour was additionally verified manually via curl against the running app, matching `docs/TESTING.md`'s intent even though the automated suite doesn't yet drive it through Playwright/supertest-style HTTP calls.
- No seed script yet — every environment starts with an empty database.

## Recommended next step

**Superseded by the master-first consolidation above:** Phase 1.5 and Phase 2.1's CRM foundation (schema + first migration) have since been merged into `master` (approved 2026-11-26 — see `docs/DECISION_LOG.md`). Remaining before resuming Phase 2.1 CRM feature work: the live-Coolify-environment items still pending in that section (GitHub default branch, Coolify webhook/secrets configuration, production verification) — see the "Master-first Git workflow consolidation" section above for exactly what's done vs. blocked on the user.
