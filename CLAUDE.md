# CLAUDE.md — working agreement for this repository

This file governs how AI coding sessions (Claude Code or otherwise) should work in **EncifOne**. Read this before writing code. It supplements, and does not replace, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/DATABASE_SCHEMA.md`.

## What this project is

A multi-tenant, AI-powered Client Operating System for professional service businesses — not a chatbot wrapper, not a generic CRM. Every feature should assume: multiple organisations (tenants) share the platform, data must never cross tenant boundaries, and AI actions must be explainable, logged, and permission-checked.

Branding (product name, taglines) is centralised in `src/config/branding.ts` — never hardcode "EncifOne" or a tagline string in a component; import `branding` instead, so a future rename is a one-file change.

## Non-negotiable rules

1. **Tenant isolation is server-side, always.** Never trust an `organisationId` from the client. Every query touching tenant data is scoped by the authenticated session's org membership, enforced in the service layer (and reinforced by DB constraints where practical). See `docs/SECURITY.md` §Tenant Isolation.
2. **No unrestricted AI-to-SQL.** AI agents call typed, permission-checked service functions — never raw SQL or unrestricted ORM access. See `docs/AI_ARCHITECTURE.md`.
3. **Money is integer minor-units or `Decimal`, never `float`.** All financial calculations go through the shared money utilities.
4. **No invented data.** AI features must not fabricate client facts, financial figures, or completion status. Missing data is surfaced as missing, not guessed.
5. **High-risk AI actions require human approval.** Sending client-facing communications, creating invoices/charges, signing/modifying contracts, and destructive operations require an approval step unless a narrowly-scoped, explicitly authorised autonomous workflow says otherwise.
6. **No fake functionality.** Don't ship a button, API route, or dashboard widget that doesn't actually work. Stub states must be visibly "coming soon," never silently inert.
7. **Migrations, not schema drift.** All Prisma schema changes ship with a migration. Breaking changes need a backfill/rollback plan noted in the PR.
8. **Secrets never in source, never in logs, never in error responses.** Use `.env` (see `.env.example`, placeholders only) and the secrets-management approach in `docs/SECURITY.md`. Never print `DATABASE_URL`, API keys, or tokens to console/CI output.
9. **Never reset, drop, or truncate a database without explicit human approval for that specific action.** This includes `prisma migrate reset`, `docker compose down -v`, and manual `DROP`/`TRUNCATE`. Destructive migrations need a reviewed backfill/rollback plan first.
10. **Preserve existing working functionality.** A new phase extends the product; it does not regress a previously-working flow. If a change must break something, say so explicitly and get confirmation first.
11. **Maintain a premium, modern enterprise UI.** Follow `docs/DESIGN_SYSTEM.md` — no generic admin-template look, no unstyled fallback states shipped as "done."

## How to work a task

1. Check `docs/IMPLEMENTATION_STATUS.md` and `docs/ROADMAP.md` for current phase and what's already done.
2. Work one module/phase at a time — don't spread a change across unrelated domains.
3. For a new feature: confirm DB model → service layer (with authorization) → API route → UI. Don't build UI against an imagined API.
4. Before marking anything done: lint, typecheck, relevant tests, migration check, build, and a quick manual pass of the UI. Update `docs/IMPLEMENTATION_STATUS.md`.
5. Prefer editing/extending existing modules over new abstractions. Three similar call sites beat a premature shared helper.
6. Commit completed, tested work with a descriptive message; push completed milestones to GitHub per the workflow below. Don't leave a finished phase uncommitted.

## Git workflow

- **`main`** — stable, production-ready releases only. Every commit on `main` should be deployable.
- **`develop`** — ongoing integration branch for active development.
- **`feature/<name>`** — individual features, branched from `develop`, merged back via PR.
- **`hotfix/<name>`** — urgent production fixes, branched from `main`, merged into both `main` and `develop`.
- **Never merge untested changes into `main`.** Lint, typecheck, tests, and build must pass first (CI enforces this — see `.github/workflows/`).
- Tag production-ready milestones with semver (`v0.1.0`, `v0.2.0`, ...) once their acceptance criteria are met.
- Never force-push to `main` or `develop`, and never rewrite published history there.

## Repo conventions

- Domain-based module structure under `src/modules/<domain>/` (e.g. `crm`, `projects`, `finance`, `ai-agents`) — not a generic MVC split.
- Each module owns its Prisma models (in a shared `schema.prisma`, grouped by domain comments), service functions, API routes, and UI.
- Shared cross-cutting concerns (`auth`, `tenancy`, `permissions`, `ai-gateway`, `billing-core`, `ui`) live under `src/lib/` or `src/core/`.
- Industry templates (§ Product Requirements) are **configuration data**, not forked code paths.

## Deployment target

- Self-hosted via **Coolify** (Docker Compose-based). See `docs/DEPLOYMENT.md`.
- **Never introduce a mandatory Vercel-only dependency** (e.g. Vercel KV/Blob/Edge Config, `next.config` options that only work on Vercel's platform). Anything the app depends on must run in a plain Docker container.
- Cloudflare in front (DNS/CDN) and Coolify-managed HTTPS/reverse-proxy are both compatible by design — don't add anything that assumes a different edge/proxy layer.

## What not to do

- Don't implement every module in this backlog at once. Follow the phase plan in `docs/ROADMAP.md`.
- Don't add a new AI provider SDK call outside the AI gateway abstraction.
- Don't add a dependency not already listed in `docs/ARCHITECTURE.md`'s stack without flagging it.
- Don't claim an integration (Stripe, Xero, WhatsApp, etc.) works until it's been exercised against that provider's sandbox/test mode.
- Don't rename database tables/columns, Docker volume names, the Compose project name, or existing migration files just for branding/cosmetic reasons — see `docs/IMPLEMENTATION_STATUS.md` for what's intentionally kept stable and why.
