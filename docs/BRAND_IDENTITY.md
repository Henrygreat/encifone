# Product brand identity

Kora is the provisional name for the AI-Powered Business Operating System by ENCIF. Use **Kora** in prose and the lowercase **kora.** wordmark in the logo. The tagline is “Your intelligent business companion.” The attribution is “A product by ENCIF.” Public use requires owner approval and trademark clearance.

## Asset system

The original geometric K uses rounded strokes. The compact icon uses an emerald cyan `#2DD4BF` to intelligence purple `#A78BFA` gradient on midnight navy `#090E18`. White `#FFFFFF` is used in the dark-surface wordmark and monochrome mark. These values belong to the assets and leave application colour tokens intact.

- `public/brand/kora/wordmark-light.svg` and `wordmark-dark.svg` are outlined horizontal logos for light and dark surfaces. Aurora uses the dark-surface variant.
- `mark.svg` is the compact mark for mobile and collapsed navigation. `monochrome.svg` is the single-ink alternative.
- `favicon.svg`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` cover browser and raster use. The legacy icon remains available at `/brand/encifone.ico`.

Use the compact mark where the full wordmark would be unreadable. Keep the SVG viewboxes intact and use a text alternative when the graphic is the sole product identifier.

## Configuration and rollout

The typed public configuration in `src/config/branding.ts` validates build inputs and drives server metadata and client rendering. It does not depend on server-only environment validation or credentials. The default build retains the existing EncifOne identity. Build a private preview with `NEXT_PUBLIC_PRODUCT_NAME=Kora`; the Kora tagline, parent, assets and AI names follow automatically.

| Optional public build variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PRODUCT_NAME` | Visible name. Kora selects the Kora assets. Other names use a text and initial fallback. |
| `NEXT_PUBLIC_PRODUCT_TAGLINE` | Tagline override. |
| `NEXT_PUBLIC_PARENT_BRAND` | Parent company and attribution override. |
| `NEXT_PUBLIC_AI_ASSISTANT_NAME` | Assistant label override. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Validated public support contact available to product surfaces. |
| `NEXT_PUBLIC_MARKETING_WEBSITE` | Validated public HTTP(S) marketing address available to product surfaces. |
| `NEXT_PUBLIC_PLATFORM_ATTRIBUTION` | `on` enables optional “Powered by” attribution. Defaults to `off`. |

Set these before `pnpm build`, or set them as Compose build inputs and rebuild the app image. A runtime restart cannot replace values compiled into client assets. Clear the overrides and rebuild to restore EncifOne. If replacing icon artwork, increment its URL version in the configuration to avoid cached copies. The change requires no database migration.

Use `branding.suite` for CRM, Sales, Workspace, Finance, Inbox, Growth, Connect and Intelligence suite names in new modules. Functional labels such as Contacts and Invoices stay concise. Kora uses “Kora AI” for the assistant and “Kora Intelligence” for the existing animated dashboard section.

## Organisation and client-facing identity

The authenticated portal prioritises the organisation’s saved `Organisation.branding` fields and falls back to its registered display name. Supported optional keys are `companyName`, `logoUrl` (HTTPS), `accentColor` (six-digit hex), `contactEmail` and `showPoweredBy`. The last option can override the deployment default for the portal. Client identity remains scoped to the current portal session. Saved widget branding takes precedence over the default offered to newly created widgets.

The existing financial document settings and issue-time snapshots continue to supply the issuer’s legal identity, logo and optional custom footer. Organisations can opt in through their existing footer configuration for future documents. Changing the platform name does not rewrite an issued PDF snapshot or alter payment links, numbering or tax calculations.

Technical identifiers remain stable, including the repository, DB models and migrations, Docker service names, credentials, provider callbacks, routes, cookies, Redis keys, storage paths, deployed domains and the `/encifone-chat.js` installation URL.
