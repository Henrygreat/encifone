# Decision Log — EncifOne

Lightweight architectural decision record. Each entry: what was decided, why, and what it supersedes. Newest first. This is a log of decisions actually made, not a design proposal — see `docs/MASTER_ROADMAP.md` for what's planned.

---

## 2026-11-26 — Observed: an external process is auto-committing working-directory state to `master`

**Observation, not a decision:** during Phase 2A Milestone D, two commits (`6ced885` "phase 2", `69f5fc2` "feat: Phase 2 CRM and modern dashboard enhancements") appeared on `origin/master`, authored under the repository's configured git identity, that were not the result of any `git commit` call made in this working session. One of them (`69f5fc2`) captured an in-progress, not-yet-fixed file (a Recharts typing error this session hadn't finished correcting yet) and pushed it straight to `master`. `.claude/scheduled_tasks.lock` — Claude Code's own session-local bookkeeping file, never project content — was also committed this way once.

**Why this is worth recording, not alarming:** the master-first CI-gated deploy design (see the 2026-11-26 "Master-first Git workflow" entry) worked exactly as intended even though the commit itself skipped this session's own pre-commit validation discipline — `lint-and-typecheck` caught the real error and correctly blocked `build`/`docker-*`/`deploy` from running on that commit. No broken code reached (or could have reached) production. Fixed forward in the next commit rather than investigated further or reverted — the mechanism producing these commits wasn't identified (possibilities include an IDE auto-commit extension or another automated agent with access to this working directory) and wasn't in scope to track down.

**Action taken:** added `/.claude/` to `.gitignore` so that specific category of accidental commit can't recur. No other change — this doesn't, by itself, change the master-first workflow or require new process, since the existing CI gate already contains the risk.

## 2026-11-26 — Phase 2A: reconciling CRM + sales pipeline + activities into one combined phase; Milestone A (design foundation) complete

**Decision:** The Phase 2 kickoff request bundled Phase 2.1 (CRM: contacts/companies/leads) and Phase 2.2 (sales pipeline/opportunities) and a new cross-cutting Activities/Tasks module — never a named subphase in `docs/MASTER_ROADMAP.md` — into one combined ask, with a full premium UI/UX transformation on top. Rather than silently reordering the roadmap or dropping scope, this is recorded as **"Phase 2A — CRM & Sales Core,"** covering 2.1 + 2.2 + Activities, delivered across the 5 milestones (A–E) the request specified, before Phase 2.3 (Client 360) resumes. `docs/MASTER_ROADMAP.md` updated accordingly.

**Milestone A (audit + design foundation) — what was built:**

1. **Audit confirmed what was reported:** Phase 2.1's `Company`/`Contact`/`Lead`/`CustomFieldDefinition`/`CustomFieldValue` existed in schema+migration only — zero service layer, API routes, or UI (`src/modules/` had only `identity/`). Nothing duplicated.
2. **Schema additions** (migration `20261126182829_sales_pipeline_and_activities`, purely additive — no existing table altered, no historical migration touched): `Pipeline`/`PipelineStage`/`Opportunity`/`OpportunityStageHistory` (matching the names already planned in `docs/DATABASE_SCHEMA.md` §4) and a new `Activity` model — deliberately one polymorphic model for calls/meetings/emails/notes/tasks/reminders rather than separate `Activity`+`Task` tables, since they share the same shape and every unified-timeline requirement needs them queried together anyway (see `docs/DATABASE_SCHEMA.md` §3 for the full rationale). Checksum recorded into `prisma/migrations/checksums.json` via `--record` against the local dev DB, per `CLAUDE.md` rule 13 — never hand-edited.
3. **Design system v2** (`docs/DESIGN_SYSTEM.md`, `src/app/globals.css`): new Indigo/Violet/Electric-Blue/Emerald/Cyan/Amber/Rose palette on Midnight Navy ink, with a dedicated CSS accent token per top-level nav module (`--module-overview/crm/sales/work/intelligence/admin`). Two tokens (`--primary`, `--destructive`) are deliberately one shade deeper than their named swatch (`#6366F1`→`#4F46E5`, `#F43F5E`→`#E11D48`) — the raw swatches measure ~4.5:1/~3.7:1 against white text, short of WCAG AA's 4.5:1 for normal text; the deepened shades measure ~6.3:1/~4.7:1. Checked by calculation, not assumed.
4. **Navigation redesigned** (`src/components/app-shell/nav-config.ts`, `sidebar.tsx`): regrouped the original 7-group IA (Workspace/Sales & Marketing/Client Management/Operations/Finance/Intelligence/Administration) into the 6 requested groups (Overview/CRM/Sales/Work management/Intelligence/Administration) — every item preserved, none dropped; Client Management folded into CRM, Finance folded into Work management. Each item now carries a Lucide icon; the active/real items (`/contacts`, `/companies`, `/leads`, `/deals`) are wired ahead of their UI actually shipping (Milestone B/C) so the nav structure doesn't need touching again per page.
5. **Reusable Bento primitives** (`src/components/bento/bento-grid.tsx`): `BentoGrid`/`BentoCard` (1–4 column span, optional module-accent top bar) and `BentoEmptyState` — structural layer only; real dashboard data wiring is Milestone D.
6. **React Three Fiber architecture** (`src/components/three/`): `@react-three/fiber@9.8.2`/`three@0.187.0`/`@react-three/drei@10.7.9` installed after verifying peer-dependency compatibility against the npm registry directly (not assumed from training data, given this repo's React 19.3.0/Next 16.4.6 are newer than most training cutoffs) — fiber requires React `>=19 <19.4`, which 19.3.0 satisfies. Built: `useWebGLSupport`/`usePrefersReducedMotion` (via `useSyncExternalStore`, not `useState`+`useEffect`, to avoid an extra post-mount render — caught by `eslint-plugin-react-hooks`'s `set-state-in-effect` rule during this work, fixed at the root rather than suppressed), `SceneErrorBoundary` (class component — a context-creation failure degrades to the caller's static fallback instead of crashing the page), and `SceneCanvas` (DPR capped at `min(devicePixelRatio, 2)`, reduced-motion and no-WebGL both routed to the fallback before any `<Canvas>` mounts). No actual 3D scene content yet — hero/dashboard-orb visuals are Milestone D, composed inside this architecture via `next/dynamic(..., { ssr: false })` from a Client Component.
7. **Also installed:** `@dnd-kit/core@6.3.1`/`sortable@10.0.0`/`utilities@3.2.2` for Milestone C's Kanban board (peer-checked: React `>=16.8`, no conflict). 8 missing shadcn primitives added (`tabs`, `popover`, `checkbox`, `switch`, `progress`, `alert`, `scroll-area`, `calendar`).

**Verified before committing:** lint, typecheck, `prisma validate`, local build all pass; `scripts/check-migration-integrity.sh` passes against the new migration.

**Supersedes:** the original 7-group sidebar IA description in `docs/DESIGN_SYSTEM.md` §3 (now §4) and the original flat colour-token table (now §2 v2 + §3 module accents).

---

## 2026-11-26 — Master-first Git workflow; branch consolidation; three real CI bugs fixed

**Decision:** Collapse `main`/`develop`/`feature/phase-1.5-infra-hardening`/`feature/phase-2.1-crm` into a single long-lived `master` branch going forward (`CLAUDE.md` §"Git workflow" rewritten). `main` and `develop` are kept, unused, as historical references, not deleted — no new work targets them. Backup tags were created for every existing branch (`backup/<branch>-20261126`) before any merging, and the merge work happened on a new `integration/master-consolidation` branch created from `master`, not on `master` itself — nothing here has been merged into `master`, the default branch has not changed, and no branch has been deleted; all of that remains gated on explicit approval.

**Why this order, not a direct merge:** three feature branches had each independently fixed overlapping problems (the applied-migration checksum incident existed in two different forms on two different branches — see the two entries below), so a blind merge risked silently reverting one branch's fix with the other's unfixed state. Each branch was merged in sequence onto the integration branch and the result was validated by actually running CI against it (pushed to a real GitHub Actions run, not just inferred from a local-equivalent check), which is what surfaced the three bugs below — none of which were suspected going in.

**Three real CI bugs found and fixed, each reproduced before being called "fixed," not assumed from the error message alone:**
1. `lint-and-typecheck` failed on `Cannot find name 'LayoutProps'` in `src/app/layout.tsx` — an ambient type Next.js only generates into the gitignored `.next/types/` directory after `next dev`/`next build` runs; CI's typecheck job never builds first, so a clean checkout genuinely lacks it. It had only ever passed locally because a prior `next dev` run left `.next/types` on disk. Fixed by typing the prop explicitly with `ReactNode` instead of relying on that generated file; verified by deleting `.next/types` locally and re-running `pnpm typecheck`/`pnpm build` clean.
2. `migration-integrity` failed with "differs from origin/master" — confirmed to be the exact corrupted-file state from the two incidents below: neither fix had ever reached `origin/master`/`origin/develop`. This is what motivated redesigning the check entirely (see the entry below) rather than patching the symptom.
3. `docker-multi-network-test` failed on the port-binding assertion. Initially assumed to be CI flakiness (nothing in the triggering commit touched Docker/networking code), but reproduced locally with the actual container instead of accepting that assumption: the check parsed `/proc/net/tcp`'s slot-index column (`sl`) instead of its local-address column, so `.startsWith('0:')` only ever meant "is this socket first in the table," not "is it bound to 0.0.0.0." It had passed previously purely by the LISTEN socket coincidentally sitting at slot 0; a leftover connection from the job's own preceding health-check curls shifted the table and made a correctly-bound app fail the check. This is the exact regression-prevention test for the 502 Bad Gateway incident below and had been silently non-functional. Fixed to read the real local-address field; verified against real container output showing the old logic fail and the new logic pass on identical input.

**Also found and fixed while verifying the migration-integrity manifest actually protects against tampering (per explicit instruction, not assumed from reading the script):** manual tests confirmed it correctly rejects modifying an already-applied migration file, but a deletion test revealed it had never checked that every manifested migration still *exists* — it only ever walked directories present on disk. Fixed by adding a pass that walks every name in `checksums.json` and fails if its file is missing.

**CI-gated production deployment added, not yet exercised live:** a `deploy` job in `.github/workflows/ci.yml`, gated on every required check passing and on a direct push to `master`, calling a Coolify deploy webhook via two new GitHub Actions secrets (`COOLIFY_WEBHOOK_URL`, `COOLIFY_WEBHOOK_TOKEN`), with a `concurrency` group so overlapping pushes queue rather than race. Coolify's own native "deploy on push" must be disabled for this resource so the two mechanisms don't both fire per push — documented in `docs/DEPLOYMENT_RUNBOOK.md`, not yet configured against a live instance.

**Supersedes:** the `develop`-centric branching model described in the 2026-11-25 "GitHub repository connection and branching strategy" entry below, and the subphase branch strategy described in the 2026-11-26 "Phase 2 scope reconciliation" entry below (subphases now target `master` directly; see `docs/MASTER_ROADMAP.md`).

---

## 2026-11-26 — Phase 1.5: production infrastructure hardening & deployment reliability

**Decision:** A dedicated phase, inserted before continuing Phase 2 feature work, to permanently fix the production deployment issues this project had been hitting (Docker build errors, Prisma P1001, Docker-network isolation, Redis env-var inconsistencies, missing runtime env vars, migration checksum mismatches, incorrect reverse-proxy domain assignment, 502s, missing `NEXTAUTH_URL`, and the Next.js container-hostname binding bug). Full operational detail lives in the new `docs/DEPLOYMENT_RUNBOOK.md`, `docs/TROUBLESHOOTING.md`, and `docs/ROLLBACK.md` — this entry is the decision record, not the how-to.

**Confirmed root causes** (verified against actual source/runtime behaviour, not assumed):
1. **Next.js standalone binding** — already fixed in Phase 1.1 on `develop`, but that fix had never reached `master`/production (only direct "env" commits to `master` existed, and they didn't include the Dockerfile change). This alone explains the reported "Coolify network works, project-specific network refused" symptom: binding to one interface IP instead of `0.0.0.0` is reachable only via whichever network happens to route to that IP.
2. **NextAuth `secret` never wired.** `src/lib/auth.ts` never passed `secret` to NextAuth v4's config, so it was falling back to auto-detecting `process.env.NEXTAUTH_SECRET` — a variable this project never sets (its own name is `AUTH_SECRET`). Fixed: `secret: env.AUTH_SECRET` passed explicitly.
3. **`NEXTAUTH_URL` never set.** Fixed: `src/lib/env.ts`'s `ensureNextAuthUrl()` defaults it from `APP_URL` as a documented side effect, imported before any auth code runs.
4. **`PORT` never explicit.** Worked by Next's own default, but implicit — now explicit in both the Dockerfile and compose.

**What changed:**
- `src/lib/env.ts` — added `NEXTAUTH_URL` (optional, defaulted from `APP_URL`) and `PORT` (defaulted to 3000); documented which variables are build-time/runtime/optional/dev-only/secret (also reflected in the rewritten `.env.example`).
- `src/lib/auth.ts` — explicit `secret: env.AUTH_SECRET`.
- `src/lib/health.ts` (new) + `/api/health/live` + `/api/health/ready` — split liveness from readiness; `/api/health` kept as a backward-compatible alias of `/ready`. Each dependency check has a bounded 3s timeout.
- `src/workers/index.ts` — heartbeat file (touched every 15s) for Docker-level health monitoring (the worker has no HTTP port to probe), plus proper `SIGTERM`/`SIGINT` handling that waits for an in-flight job before closing.
- `Dockerfile` — `PORT=3000` explicit; `HEALTHCHECK`s now point at `/api/health/ready` (app) and a heartbeat-freshness check (worker); both runtime stages run as the non-root `node` user; `GIT_SHA` build arg baked into `/app/GIT_SHA` in every image for version tracking (`docs/ROLLBACK.md`).
- `docker-compose.yml` — `NODE_ENV`/`HOSTNAME`/`PORT` set explicitly at the compose level too (belt-and-suspenders with the Dockerfile); `deploy.resources.limits` added per service; **`app`'s `ports: ["3000:3000"]` mapping removed** (moved to `docker-compose.local.yml` only) — see the dedicated entry below for why.
- `.gitattributes` (new) — forces LF line endings for `prisma/migrations/**/*.sql` (and sane repo-wide defaults), to stop `core.autocrlf=true` from silently breaking migration checksums on branch switches — this had already happened twice (see the entry below).
- `scripts/` (new directory) — `validate-env.sh`, `deploy-preflight.sh`, `deploy-verify.sh`, `diagnose-deployment.sh`, `check-migration-integrity.sh`. All non-destructive; none print secret values. Each one was actually run and its output verified during this work, not just written.
- `.github/workflows/ci.yml` — added `migration-integrity`, Compose config validation, `docker-multi-network-test` (reproduces the exact production incident — builds the real `app` image, attaches two Docker networks, asserts reachability through both), and `docker-smoke-test` (builds and runs the actual `migrate`/`app`/`worker` images, not the dev server, including a full auth round trip and a worker-heartbeat check).

**Removing `app`'s published host port — evidence, not a guess:** two independent signals pointed the same way. First, the live production diagnostics showed Traefik already routing to the app via the Coolify-managed Docker network, not a published host port. Second, Coolify's own documentation states zero-downtime blue-green redeploys/rollbacks require a health check (now present) *and no published port* on that service — with one published, a new container can't bind the same host port until the old one is removed, forcing a gap instead of a clean cutover. **Not yet verified live**: whether removing it affects Coolify's UI ability to (re)assign a domain to `app` — flagged explicitly in `docs/IMPLEMENTATION_STATUS.md` as pending, with a one-line revert documented in `docs/TROUBLESHOOTING.md` if it turns out to matter.

**GitHub branch protection / Coolify deploy-trigger configuration:** could not be applied directly — the `gh` CLI was not available in this working environment. Exact manual steps are documented in `docs/DEPLOYMENT_RUNBOOK.md` §1.1–§1.2 instead.

**Explicitly not done, by instruction:** no merge into `master`, no Coolify deployment triggered, no production database touched, no staging environment actually provisioned (designed only, `docs/DEPLOYMENT_RUNBOOK.md` §5), no `main` branch deleted.

**Validated:** full local stack rebuild after every change (not just at the end); `app`/`worker` both report Docker-healthy; `/proc/net/tcp` inside the app container confirmed `0.0.0.0:3000`; a full register → sign-in → session → authenticated-API-call round trip passed against the rebuilt stack; `scripts/check-migration-integrity.sh` tested against both a clean state and a deliberately-tampered commit (confirmed it actually catches a violation, not just that it passes); lint/typecheck/tests/build all pass. See `docs/IMPLEMENTATION_STATUS.md` for the full record including what remains pending live-environment verification.

---

## 2026-11-26 — Applied migration checksum incident, round two: fix was isolated to the wrong branch

**Decision:** No new policy beyond rule 13 (already added) — this entry records a second occurrence of the same class of incident, caused by a process gap rather than a new root cause, and the fix.

**What happened:** the original checksum fix (reverting a migration file's comment text + line endings to match its applied checksum) was performed on `feature/phase-2.1-crm` only. It was never merged into `develop`. When `feature/phase-1.5-infra-hardening` was later branched from `develop` (correctly, per instruction, to keep infra work separate from CRM feature work), it inherited `develop`'s *unfixed* copy of that migration file — reintroducing the identical checksum mismatch against the same shared local database (git branches share one Docker volume locally; the database doesn't care which branch is checked out).

**Fix:** re-applied the same two-part fix (revert the comment text to its original wording; convert CRLF back to LF — confirmed `core.autocrlf=true` reconverts it on every branch checkout) directly on `feature/phase-1.5-infra-hardening`, and added `.gitattributes` (see the main Phase 1.5 entry above) so this cannot recur regardless of local git config. The underlying fix still needs to reach `develop` properly (via whichever branch merges first) so a third branch made from `develop` doesn't inherit the same stale state.

**Verified:** `sha256sum` of the restored file matches `_prisma_migrations.checksum` exactly; `prisma migrate status` reports "up to date"; the other applied migration unaffected.

---

## 2026-11-26 — Applied Prisma migrations are immutable; checksum incident fixed without a reset

**Decision:** Previously-applied Prisma migration files must never be modified after the fact — not for a comment, formatting, or a stale doc-link reference. Codified as CLAUDE.md non-negotiable rule 13. All future schema changes go in new migration files.

**Incident:** The repo-wide `docs/ROADMAP.md` → `docs/MASTER_ROADMAP.md` rename swept a comment inside the already-applied `20261125124136_enable_pgvector/migration.sql`. Prisma's checksum (computed from exact file bytes, including line endings) no longer matched what was recorded in `_prisma_migrations`, and `prisma migrate status`/`migrate dev` offered only `prisma migrate reset` (wipes the database) as a CLI-native fix — forbidden by rule 9 without explicit approval for that specific destructive action.

**Fix (no reset, no manual `_prisma_migrations` edit — both declined):** reverted the migration file's comment text to its original wording, and separately restored its original LF line endings (the working-tree copy had been converted to CRLF by git's `core.autocrlf=true` on an intervening checkout — the file as originally applied, written directly to disk before any git round-trip, was LF). `docs/MASTER_ROADMAP.md` itself was **not** renamed back — only the stale in-migration reference was reverted, so one historical migration comment now says "`docs/ROADMAP.md`" even though that file is now `docs/MASTER_ROADMAP.md`. This is intentional: migration files are an immutable historical record, not living documentation.

**Verified:**
- `sha256sum` of the restored file matches `_prisma_migrations.checksum` exactly (`d3296a2ac9...`).
- The other applied migration (`20261125105100_init`) checksummed and compared too — unaffected, no drift.
- `prisma validate` — schema valid. `prisma migrate status` — "Database schema is up to date!"
- Lint, typecheck, automated tests (9/9), and `pnpm build` all pass.
- No `_prisma_migrations` row was edited manually; no database was reset, dropped, or had data modified; no migration file was deleted; nothing was pushed or merged to `master`; no Coolify deploy was triggered. All work stayed on `feature/phase-2.1-crm`.

---

## 2026-11-26 — Phase 2 scope reconciliation: subphases, with two narrow pull-forwards from Phase 3

**Decision:** `docs/MASTER_ROADMAP.md`'s single "Phase 2" entry is decomposed into subphases 2.1–2.8 (CRM foundation, sales pipeline, client workspace, service catalogue, proposals, contracts, payments/conversion, AI sales intelligence), each on its own feature branch. This is the same Phase 2 scope as originally planned, broken down to the detail level requested at Phase 2 kickoff — not a scope expansion.

**Two deliberate, narrow deviations from the original phase boundaries:**
1. **Client 360 workspace (2.3)** is pulled forward from Phase 3 — but only the internal workspace/record view. Client portal invitation, client-facing login, and onboarding remain Phase 3, unchanged.
2. **Client record creation on conversion (2.7)** is pulled forward from Phase 3 for the same reason — payments/conversion logically needs a `Client` record to convert *into*. Portal/onboarding activation of that client is still Phase 3.

Both are scoped narrowly (data model + internal view only, no client-facing surface) specifically so Phase 3's actual remaining scope (portal, onboarding) is unaffected.

**Why:** Phase 2's kickoff brief specified this exact 2.1–2.8 structure with its own acceptance criteria per subphase and separate feature branches — reconciling the roadmap to match avoids two documents disagreeing about what's in flight.

---

## 2026-11-26 — Production branch reconciled to `master`; first Coolify deployment hardening

**Decision:** `master` is now the production branch (what Coolify deploys), per explicit instruction at the start of Phase 2. `main` (created during initial GitHub setup, Phase 1.1) still exists but is no longer used — not deleted, superseded.

**Context:** Between the Phase 1.1 session and this one, `master` received a direct commit (`d2cf8c5`, "env" — a one-line `docker-compose.yml` edit to the `migrate` service's `REDIS_URL`) and was pushed to `origin/master`, and a first real Coolify deployment was attempted and is now accessible. `develop` was one commit behind; it was fast-forwarded to match `master` before any further work, per instruction ("ensure develop includes the latest validated production fixes before starting").

**Deployment issues found and fixed** (the stated goal was that these must not recur):
1. **Environment variables.** `docker-compose.yml` no longer uses `env_file:` at all (Coolify's Compose env-var handling has a documented history of `env_file` entries being auto-injected/rescoped/overridden across its versions). Every variable each service needs is now explicit via `${VAR}` interpolation, which is the one mechanism Coolify's own docs describe as stable. Separately, a real latent bug was found: the `worker` imports the same `src/lib/env.ts` as `app` (for `REDIS_URL`), which eagerly validates the *entire* env schema on import — including the required, no-default `AUTH_SECRET` — so the worker would crash on startup without `AUTH_SECRET`/`APP_URL` set for it specifically, not just for `app`. Both are now explicitly declared on the `worker` service.
2. **Docker networking / Next.js standalone bind address.** Docker sets `HOSTNAME` to the container's own id in every container; Next's standalone `server.js` binds to `HOSTNAME` if set, so without an override the app was binding to its own container IP rather than `0.0.0.0` — reachable via Docker's host port-publishing NAT (which targets the container IP directly) but *not* via loopback from inside the container itself. Fixed with `ENV HOSTNAME=0.0.0.0` in the `app` Dockerfile stage. Confirmed via `/proc/net/tcp` inside the container before (bound to its own IP) and after (bound to `0.0.0.0`) the fix.
3. **Reverse-proxy domain assignment.** Documented explicitly (`docs/DEPLOYMENT.md` §4.1) that Coolify only domain-routes services with a `ports:` mapping — only `app` has one — and that the production domain/FQDN must be assigned to the `app` service alone in Coolify's UI, never to `worker`/`migrate`/`redis`.
4. **Database network isolation.** Documented the Coolify-specific fix: a separately-provisioned Database resource is on a different Docker network from a Compose resource by default; enable "Connect to Predefined Network" and use the database's Internal URL, not `localhost` or a guessed hostname. Also confirmed and documented: never add a custom top-level `networks:` block to the compose file — Coolify's own docs warn this causes intermittent HTTPS outages for Compose apps.
5. Added a Docker `HEALTHCHECK` to the `app` image (Node's built-in `fetch` against `/api/health` on `127.0.0.1` — no `curl`/`wget` needed in the alpine base), which is also what surfaced finding #2 above.

**Validated:** full local stack rebuilt (`pnpm docker:local up -d --build`) against these changes — app healthcheck passes, bind address confirmed `0.0.0.0:3000`, worker starts cleanly, `/api/health` ok, lint/typecheck/tests all pass. See `docs/IMPLEMENTATION_STATUS.md`.

---

## 2026-11-25 — Database standard: PostgreSQL 18 + pgvector

**Decision:** The approved database engine for EncifOne, in every environment, is **PostgreSQL 18 with the `pgvector` extension**, via the `pgvector/pgvector:pg18` Docker image locally and a separately-provisioned Coolify-managed PostgreSQL 18 + pgvector instance in production. **This supersedes the earlier PostgreSQL 16 (and any prior PostgreSQL 17) configuration.**

**Why:** pgvector readiness is needed ahead of the planned AI Client Memory, Client Digital Twin, semantic search, document embeddings, RAG, and knowledge-base modules (`docs/MASTER_ROADMAP.md` Phase 11+), and the user made an explicit platform decision to standardise on PG18 + pgvector for Coolify hosting.

**What changed:**
- Local dev: `postgres:16-alpine` → `pgvector/pgvector:pg18`, on a **new** Docker volume (`postgres_data_pg18`) mounted at `/var/lib/postgresql` (not `.../data` — PG18's official images moved `PGDATA` to a version-specific subdirectory and moved the declared `VOLUME` up a level; see `docs/DEPLOYMENT.md` §3). The old `postgres_data` (PG16) volume and a `pg_dump` backup (`backups/clientos_pg16_backup_20261125.{dump,sql}`, gitignored) were both retained, not deleted, pending explicit approval.
- A new Prisma migration (`20261125124136_enable_pgvector`) runs `CREATE EXTENSION IF NOT EXISTS vector;`. No vector column, index, or AI table was added — that's explicitly out of scope until the Knowledge Base/RAG phase.
- `docker-compose.yml` was split into a production-safe base file (no Postgres container — production uses the externally-provisioned Coolify instance; no public port for Redis) and `docker-compose.local.yml` (adds the local Postgres 18 + pgvector container, republishes local ports). Production never runs a duplicate Postgres container.
- CI's ephemeral test-database service container also moved to `pgvector/pgvector:pg18`, with an explicit step asserting the `vector` extension is enabled.

**Known caveat:** Prisma's schema-engine introspection (`prisma db pull`) has a reported panic against some PostgreSQL 18 `NOT NULL` constraint metadata on Prisma ORM 7.x (fixed in 8.x). This project's workflow is schema-first (hand-written `schema.prisma` + generated migrations), which does not exercise that code path — but avoid running `prisma db pull` against this database on Prisma 7 until upgrading to Prisma 8.

**Validated:** connectivity, `prisma validate`, migrations (including the new one), pgvector extension presence, authentication, organisation management, tenant isolation, worker connectivity, lint, typecheck, automated tests, and both local (`pnpm build`) and Docker production builds — all against the restored PG18 database. See `docs/IMPLEMENTATION_STATUS.md` for the full validation record.

---

## 2026-11-25 — Rebrand: ClientOS AI → EncifOne

**Decision:** Product name changed from the working name "ClientOS AI" to **EncifOne**, centralised in `src/config/branding.ts`.

**Why:** Official branding decision; a GitHub repository (`github.com/Henrygreat/encifone`) was created under the new name.

**What changed:** Page metadata, auth pages, sidebar header, worker logs, `package.json` name, and all documentation. **What didn't change** (to avoid data loss/unnecessary churn): the Docker Compose project name and volumes, the Postgres role/database name already initialised in the (then-PG16) volume, the active-org cookie key, and all Prisma model/migration names — none of these are customer-facing branding. See `docs/IMPLEMENTATION_STATUS.md`.

---

## 2026-11-25 — GitHub repository connection and branching strategy

**Decision:** Connected the local repository to `https://github.com/Henrygreat/encifone.git` as `origin`. Adopted `main` (stable/tagged) + `develop` (ongoing) + `feature/*`/`hotfix/*` branching.

**Why:** Move from a local-only repo to a shared, CI-backed GitHub workflow ahead of further development.

**Context:** The remote was empty (no existing commits/branches) when connected, so the full local history was pushed directly — no merge or force-push was needed.

---

## 2026-11-25 — Prisma 7: datasource URL moved out of `schema.prisma`

**Decision:** Adopted Prisma 7's new configuration model: the database connection URL lives in `prisma.config.ts` (via the `PrismaPg` driver adapter) and is passed to `PrismaClient` at runtime, not declared via `datasource.url` in `schema.prisma` (no longer supported there as of Prisma 7).

**Why:** Prisma 7 made this a breaking requirement, not a choice. `prisma.config.ts` reads `process.env.DATABASE_URL` directly (not the `env()` config helper) specifically so `prisma generate` doesn't require a real database connection to succeed — this matters for Docker layer caching, where `prisma generate` runs in a `deps` build stage before any real `DATABASE_URL` is available.

---

## 2026-11-25 — Cache Components disabled

**Decision:** Next.js 16's `cacheComponents` (the PPR successor, on by default in a fresh scaffold) is explicitly set to `false` in `next.config.ts`.

**Why:** This application is session/tenant-scoped on nearly every route (`docs/ARCHITECTURE.md` §4) — a prerendering-first caching model doesn't fit, and sprinkling `"use cache"` boundaries through pages that are dynamic by design would be working against the architecture rather than with it. Revisit only if a genuinely static, cacheable surface (e.g. the eventual public marketing site) needs it.

---

## 2026-11-25 — Modular monolith, not microservices

**Decision:** EncifOne is built as a modular monolith (one Next.js app, one database, domain-separated modules) with independent BullMQ workers, not a microservices architecture.

**Why:** At MVP/early-growth scale, microservices add deployment and observability overhead with no corresponding benefit for a small team and still-settling domain boundaries. See `docs/ARCHITECTURE.md` §1 for the full rationale and the conditions under which this would be revisited.

---

## 2026-11-25 — Core technology stack (Phase 0)

**Decision:** Next.js (App Router) + TypeScript (strict) + Tailwind CSS + shadcn/ui (Radix UI primitives) on the frontend; PostgreSQL + Prisma + Redis + BullMQ on the backend; a provider-agnostic AI gateway (not locked to one model provider); Docker Compose + Coolify for hosting (explicitly not Vercel).

**Why:** See `docs/ARCHITECTURE.md` and `docs/PRODUCT_REQUIREMENTS.md` for the full rationale, competitive analysis, and alternatives considered.
