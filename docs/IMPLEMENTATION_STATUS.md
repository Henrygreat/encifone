# Implementation Status — EncifOne

_Last updated: 2026-11-25_

> Rebranded from the working name "ClientOS AI" to **EncifOne** during the GitHub-integration pass (see "GitHub integration & branding" below). No database tables, Docker volumes, migration files, or other internal identifiers were renamed as part of this — see that section for exactly what was and wasn't touched, and why.

## Current phase: Phase 1 — Foundations & scaffolding (complete)

### Completed and verified

**Scaffolding & infra**
- Next.js 16 (App Router, TypeScript strict) + Tailwind v4 + shadcn/ui (Radix UI base) + Lucide icons.
- PostgreSQL via Prisma 7 (pg driver adapter — see `prisma.config.ts` / `src/lib/prisma.ts`), Redis via ioredis, BullMQ worker process.
- Docker Compose stack (`postgres`, `redis`, `migrate`, `app`, `worker`) — **verified**: `docker compose up -d --build` brings up all four services from a clean build, migrations run automatically via the `migrate` one-shot service, `/api/health` reports both Postgres and Redis reachable.
- Multi-stage `Dockerfile` producing a standalone Next.js runtime image and a separate worker image.
- GitHub Actions CI (`.github/workflows/ci.yml`): lint, typecheck, test (with Postgres/Redis service containers + migration), build.
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

All four criteria from `docs/ROADMAP.md` Phase 1 are met:
1. ✅ Register, create an org, invite a second user with a different role, switch between two orgs with visibly different data scoping.
2. ✅ Cross-tenant API access is rejected (automated test + manual verification).
3. ✅ `docker compose up` brings up app+DB+Redis+worker from a clean build; migrations run automatically.
4. ✅ Lint, typecheck, test, and build all pass clean.

### Not started (everything outside Phase 1 scope)

No CRM, sales, proposals, projects, finance, helpdesk, AI, or any other domain module exists yet — see `docs/ROADMAP.md` Phase 2 onward. The dashboard, sidebar, and command palette intentionally show these as "Planned," not implemented.

## Known limitations

- **No email delivery.** Invite links must be shared manually. This blocks any real multi-user onboarding until an email provider (Resend/Postmark) is wired up — planned alongside Phase 2's proposal/contract flows.
- **MFA is a schema stub only** — no enrolment or challenge UI.
- **Prisma 7 config** moved the datasource URL out of `schema.prisma` into `prisma.config.ts` / the `PrismaPg` adapter (a breaking change from earlier Prisma majors) — if upgrading Prisma further, re-check `https://pris.ly/d/prisma7-client-config` for further changes.
- **`cacheComponents` (Next 16's PPR successor) is disabled** in `next.config.ts` — this app is session/tenant-scoped on nearly every route, which doesn't fit a prerendering-first model. Revisit only if a genuinely static, cacheable surface (e.g. the future marketing site) needs it.
- Local dev Postgres/Redis ports are remapped (5433/6380) in `docker-compose.yml` to avoid colliding with other local stacks — adjust `POSTGRES_HOST_PORT`/`REDIS_HOST_PORT` if that still collides for you.
- Tenant-isolation automated tests exercise the service layer (the actual enforcement point behind every route) rather than full HTTP requests against a running server; the HTTP-level behaviour was additionally verified manually via curl against the running app, matching `docs/TESTING.md`'s intent even though the automated suite doesn't yet drive it through Playwright/supertest-style HTTP calls.
- No seed script yet — every environment starts with an empty database.

## Recommended next step

Begin **Phase 2 — CRM + Sales minimal + Proposal/Contract + Payment (deposit)** per `docs/ROADMAP.md` §3: Lead/Contact/Company CRUD, one sales pipeline, a proposal builder with e-signature, and a Stripe test-mode deposit checkout, building on the identity/tenancy/RBAC foundation shipped in Phase 1.
