# Kora rebranding report

The provisional identity lives on `feature/kora-branding` in commit `0925ca7ba9cc070903e12e5fe614433dc8759c02` (`feat(branding): introduce configurable Kora product identity`). The local branch started from the clean Phase 5.1 enhancement branch at `a94617d`, which includes its completed communications work. No separate local Phase 6 branch or in-progress changes were present. Review the branding commits independently if landing onto a base without those Phase 5.1 changes.

## Audit and changes

| Area | Files and change |
| --- | --- |
| Configuration and rollout | `src/config/branding.ts`, `.env.example`, `Dockerfile` and `docker-compose.yml` define validated public build overrides. EncifOne is the default. |
| Assets and metadata | `public/brand/kora/` contains two wordmarks, a compact mark, a monochrome mark, an SVG favicon, 192/512 PNG icons and an Apple touch icon. `src/app/layout.tsx` publishes title, description, application and Open Graph metadata. `/favicon.ico` resolves to the selected identity while the original ICO remains available. |
| App and authentication | `src/components/product-brand.tsx`, sidebar and mobile navigation use the configured identity. Sign-in, registration and organisation invite cards display the wordmark and signature in the preview build. The landing page uses the configured tagline and attribution. |
| AI and communications | The existing dashboard animation displays the configured intelligence label. The Inbox assistant displays the configured assistant name. Communication Centre and setup screens use central brand names, with the product name as the initial value for a new widget’s public brand field. |
| Portal and documents | Authenticated portal identity resolves from existing organisation branding. Client sign-in and recovery already used the central product name. Shared proposals and contracts use optional platform attribution. Financial renderers, templates and stored snapshot data are untouched. |
| Documentation and checks | `README.md`, the roadmap, implementation status and [brand identity guide](BRAND_IDENTITY.md) explain use and rollback. Tests add brand resolution and browser coverage. The implementation commit records the complete file list. |

Visible legacy names in runtime code now resolve from the central configuration. Remaining repository references are retained in historical documentation, legacy defaults or compatibility identifiers. Preserved identifiers include the GitHub repository and package name, database schema and migrations, Compose service names, authentication cookies, theme storage key, conversation installation URL and storage namespace, invoice signing and idempotency keys, provider callback URLs, sender credentials and existing domains. The CSS, Tailwind configuration, layout grids, application theme tokens and animation sources have no changes.

## Validation

- Prisma client generation passed. This milestone contains no schema changes or database migrations.
- TypeScript and production builds passed with Kora enabled and with the branding override cleared.
- ESLint reported zero errors and two pre-existing React Hook Form warnings. All 132 Vitest unit and integration tests passed, including portal password reset and session invalidation.
- Seven Chromium workflows passed on the Kora build, including sign-in, asset selection, expanded/collapsed/mobile navigation, all three themes across desktop/tablet/mobile, four Phase 4 finance workflows, external website chat and Calendar scheduling. The existing three dashboard geometry checks skipped because their fixture has no authenticated session. The branding smoke test passed separately against the default EncifOne build using the same development database.
- Docker Compose configuration validation passed. A fresh Docker image build, production rollout, live payment and live mail verification were outside this local validation.

## Limitations and rollback

The repository does not currently provide dedicated platform welcome, invitation, security or recovery email templates to rebrand. Existing invite and password-reset workflows, transactional invoice mail and configured senders remain in place. There is no public booking implementation or Phase 6 marketing module on this branch. The Growth label is available through the central configuration. Portal branding reads existing organisation JSON and adds no admin editor or per-client override storage.

For private review, set `NEXT_PUBLIC_PRODUCT_NAME=Kora` before building. For rollback, clear the public branding overrides and rebuild or select the previously validated EncifOne image. There is no data rollback. Kora remains provisional. Public activation requires the owner’s approval after trademark clearance.
