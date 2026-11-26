# Design System — EncifOne

## 1. Principles

Premium SaaS feel inspired by Linear, Attio, HubSpot, Stripe, Vercel, Notion, and modern enterprise analytics dashboards — never a generic AI-generated admin template. Dense but calm: generous whitespace, clear hierarchy, purposeful colour, no unnecessary gradients/glass effects/oversized borders/decorative animation.

## 2. Tokens (defaults — fully overridable per tenant, see §6; v3 "Intelligent Workspace" palette adopted 2026-11-26 — Phase 2A.1 — see `docs/DECISION_LOG.md`, superseding v2)

Dark-first palette — Midnight/Deep Navy are the brand's primary identity; light mode uses the same accent hues on a clean light surface for consistency, not a different brand. CSS custom properties, `src/app/globals.css`; every token has a dark-mode (`.dark`) counterpart.

| Token | Light value | Dark value | Role |
|---|---|---|---|
| `--background` | `#F7F9FB` | `#060B14` (Midnight) | App background |
| `--foreground` | `#0B1220` | `#E7ECF4` | Primary text |
| `--card` / `--popover` | `#FFFFFF` | `#101827` (Deep Navy surface) | Surfaces |
| `--primary` | `#10B981` | `#10B981` | Primary actions — paired with a **dark** foreground, not white (see below) |
| `--primary-foreground` | `#060B14` | `#060B14` | Emerald measures ~2.5:1 against white text (checked by calculation), but ~8.3:1 against this dark navy — the natural pairing for a bright-accent-on-dark system, not an invented deepened shade |
| `--destructive` | `#FB7185` | `#FB7185` | Coral, same dark-foreground reasoning (~2.7:1 vs. white, ~7.8:1 vs. `#060B14`) |
| `--muted-foreground` | `#5B6578` | `#8B97AC` | Secondary text |
| `--border` / `--input` | `#E2E7EE` | `rgba(255,255,255,.08–.12)` | Hairlines |
| `--chart-1`…`--chart-5` | Emerald/Cyan/Violet/Blue/Gold | — | Chart series |
| `--shadow-elevated` | `0 12px 32px -8px rgba(11,18,32,.18)` | `0 20px 48px -12px rgba(0,0,0,.55)` | `.shadow-elevated` utility |

Named swatches: Midnight `#060B14`, Deep Navy `#101827`, Emerald `#10B981`, Cyan `#22D3EE`, Violet `#8B5CF6`, Blue `#3B82F6`, Gold `#FBBF24`, Coral `#FB7185`, Lime `#A3E635` (reserved — not yet assigned to a token; available for a future module accent or chart series).

Typography: Geist (`next/font/google`, `src/app/layout.tsx`) — **locally bundled by construction**, since `next/font` downloads and self-hosts font files at build time rather than loading from Google's CDN at runtime; nothing further was needed for "locally bundled fonts" beyond fixing the bug below. Scale: 14–16px body, 24–32px page headings, 28–40px KPI figures.

**Bug fixed 2026-11-26:** `--font-sans` previously read `var(--font-sans)` — a self-reference that never resolved, since the variable Next's font loader actually injects is `--font-geist-sans`. Tailwind's `font-sans` utility (applied to `<html>`) was falling through to the browser's default font stack — confirmed as the root cause of a serif-in-production report, and confirmed fixed by inspecting the actual compiled CSS output (not just reading the source) after the fix: `--font-geist-sans` resolves, and `--font-sans` now correctly points to it.

## 3. Module accent colours

Each top-level navigation group (`src/components/app-shell/nav-config.ts`) has a dedicated accent token, used for its icons, active-state highlight, and (where a module has its own dashboard widgets) chart series belonging to it:

| Module | Token | Value (light & dark) |
|---|---|---|
| Overview | `--module-overview` | `#22D3EE` (Cyan) |
| CRM | `--module-crm` | `#FBBF24` (Gold) |
| Sales | `--module-sales` | `#10B981` light / `#34D399` dark (Emerald) |
| Work management | `--module-work` | `#3B82F6` light / `#60A5FA` dark (Blue) |
| Intelligence | `--module-intelligence` | `#8B5CF6` light / `#A78BFA` dark (Violet) |
| Administration | `--module-admin` | `#64748B`/`#94A3B8` (muted slate — deliberately neutral; settings shouldn't compete for attention) |

## 4. Layout patterns

- **Collapsible sidebar**, regrouped 2026-11-26 from the original 7-group product-brief IA into 6 groups — Overview / CRM / Sales / Work management / Intelligence / Administration — to match the navigation redesign requested for Phase 2A (every original item preserved, remapped: Client Management → CRM, Finance → Work management; see `docs/DECISION_LOG.md`). Collapses to a compact **icon-only rail** (`w-16`), not a vanished sidebar (Phase 2A.1). Not-yet-built ("Planned") items collapse behind a per-group "+N more" disclosure after the first 2, rather than rendering every placeholder row inline — "less intrusive presentation of planned modules." Orgs can hide modules they don't use via entitlement + preference settings (unimplemented — tracked in `docs/IMPLEMENTATION_STATUS.md`).
- **Mobile navigation** (`src/components/app-shell/mobile-nav.tsx`, Phase 2A.1): a `Sheet`-based drawer sharing `SidebarNav` with the desktop sidebar, so the two can never drift apart. The sidebar itself is `hidden md:block` with no mobile alternative before this — a real, now-fixed gap, not a cosmetic addition.
- **Breadcrumbs** (`src/components/app-shell/breadcrumbs.tsx`, Phase 2A.1): derived from the current path against `nav-config.ts`'s real labels, falling back to a humanised path segment; hidden on `/dashboard` itself.
- **Notification centre** (`src/components/app-shell/notification-centre.tsx`, Phase 2A.1): a real, functional popover shell with an honest "nothing yet, not wired up to anything" empty state — no notification backend exists, so nothing here is fabricated (CLAUDE.md rules 4/6).
- **Bento-grid executive dashboard** (`src/components/bento/bento-grid.tsx`): asymmetric **12-column** grid (collapsing to 6 at `sm`, 1 below that), cards sized via `colSpan` (3/4/6/8/12) and `rowSpan` (1–3) — never a uniform repeating KPI-card wall. Each widget: clear label, value, trend/delta where meaningful, and a visible distinction between actual vs. projected figures. An optional `variant="glass"` applies the subtle glassmorphism + gradient-border utilities below, used sparingly (the dashboard's welcome hero), never as the default card style. User-rearrangement (dnd-kit) is planned, not yet implemented.
- **Glassmorphism & gradient borders** (`.glass-panel`, `.gradient-border`, `.shadow-elevated` utilities in `globals.css`): a translucent blurred surface, a 1px gradient border via `mask-composite` (respects the element's own border-radius exactly, no extra wrapper), and an elevation shadow token. Used sparingly per §1's "no unnecessary glass effects" — the welcome hero and future-module preview cards, not every panel.
- **Data tables** (TanStack Table): sticky header, column sort/resize/hide, saved views, bulk-action toolbar on selection, pagination or virtualised scroll for large sets.
- **Kanban boards** (dnd-kit `@dnd-kit/core`/`sortable`): drag-and-drop must persist to the database on drop, with optimistic UI that rolls back and surfaces a toast on a failed write — never a silent local-only reorder.
- **Global command palette** (⌘K / Ctrl+K) for navigation, record search, and quick actions.
- **Forms**: React Hook Form + Zod, inline validation, clear required/optional marking, autosave where appropriate (long forms, document editors).

## 5. Component states (required for every data-bearing view)

- Skeleton loading (not spinners) for lists/cards/tables.
- Empty state: explain what the view is for and offer the primary create action — never a bare "No data." Dashboard widgets use `BentoEmptyState` (`src/components/bento/bento-grid.tsx`) rather than fabricating figures (CLAUDE.md rule 4).
- Error state: human-readable message + retry action; never a raw stack trace to the user.
- Confirmation dialog before any destructive or hard-to-reverse action.
- Toast notifications for background/async action results (e.g. "Invoice sent," "Import completed with 2 warnings") — `sonner`, already wired (`src/components/ui/sonner.tsx`).

## 6. Accessibility

- WCAG 2.1 AA colour contrast minimum for all text/background combinations, checked for both light and dark themes — verified by calculation for every text-bearing token pairing in the v3 palette (`--primary`/`--destructive` against their dark foreground, ~8.3:1/~7.8:1; the client-portal theme's `--primary` against white, deepened to `#047857` for ~5.5:1), not assumed from the named swatches alone.
- Full keyboard navigation for the app shell, command palette, tables, and forms; visible focus states (Radix UI primitives provide this baseline — don't override focus rings away).
- Semantic HTML and ARIA labelling via shadcn/ui + Radix UI defaults; any custom component must match that baseline before shipping.
- `prefers-reduced-motion` respected everywhere motion is used — both Framer Motion transitions (§7) and any 3D scene (§8), via `usePrefersReducedMotion` (`src/components/three/use-webgl-support.ts`) and equivalent checks for Framer Motion usage as it's added.

## 7. White-label & theming (tenant + platform configurable)

- Product name, logo, favicon, and the full colour token set above are overridable per organisation (client portal) and at the platform level (for white-label resellers, Phase 2+).
- Theme values are stored as data (`Organisation.branding` config), not hardcoded — changing them never requires a code change or redeploy.
- Client portal theming is scoped to the portal surface only; internal staff UI always uses the platform's own (or the org's chosen) theme, keeping internal tooling consistent even for heavily white-labelled client-facing portals.

## 8. Motion

Framer Motion used purposefully: page/panel transitions, drag-and-drop feedback (Kanban, dashboard widgets), subtle state-change confirmation. No decorative animation that delays comprehension or data access. Respect `prefers-reduced-motion` (§6).

## 9. React Three Fiber architecture

Added 2026-11-26 (Milestone A of the Phase 2A UI transformation — see `docs/DECISION_LOG.md`). Compatibility verified against npm before installing, not assumed: `@react-three/fiber@9.8.2` requires React `>=19 <19.4` (this repo: React 19.3.0 — fits), `three@0.187.0`, `@react-three/drei@10.7.9` (peer: `@react-three/fiber@^9.0.0`, `react@^19`).

**Where the architecture lives** (`src/components/three/`), all client-only, none used from a Server Component:
- `use-webgl-support.ts` — `useWebGLSupport()` and `usePrefersReducedMotion()`, both built on `useSyncExternalStore` (the React-recommended pattern for a client-only/browser-differs-from-server value — avoids the extra post-mount render a `useState`+`useEffect` version would cause). `useWebGLSupport()` resolves `null` (unknown, SSR/first paint) → `true`/`false`.
- `scene-error-boundary.tsx` — `SceneErrorBoundary`, a class component (error boundaries must be) that catches a render/context-creation failure anywhere inside a `<Canvas>` subtree and swaps to the caller's static fallback instead of crashing the page.
- `scene-canvas.tsx` — `SceneCanvas`, the single place every 3D surface mounts a `<Canvas>` through. In order: renders the caller's `fallback` if `prefers-reduced-motion` is set or WebGL isn't supported (including the `null`/not-yet-known state — never flash 3D content before that's resolved); caps device pixel ratio at `min(devicePixelRatio, 2)`; wraps the `<Canvas>` in `SceneErrorBoundary`; listens for `webglcontextlost` and logs rather than letting the page hang.

**The rule every future scene must follow:** the actual creative content is a separate module, dynamically imported with `next/dynamic(..., { ssr: false })` **from a Client Component** (Next.js App Router requirement — a Server Component cannot itself call `dynamic(..., { ssr: false })`), composed inside `<SceneCanvas>`. Never import `three`/`@react-three/fiber`/`@react-three/drei` from a file that can render on the server, and never place a 3D component inside an ordinary data table, form, or operational page (per your own instruction) — decorative/hero surfaces only.

**Creative content shipped (Milestone D):**
- `scenes/hero-network-scene.tsx` + `hero-scene.tsx` — the landing-page hero: five module-coloured nodes orbiting a wireframe core, connecting lines, `Sparkles` particles, slow rotation plus pointer-parallax, scene `fog` for atmospheric depth, and a slow-rotating "horizon" ring (Phase 2A.1). Wired into `src/app/page.tsx`, positioned behind the hero text (`absolute -z-10` + a radial scrim), never interleaved with it.
- `scenes/ai-orb-scene.tsx` + `ai-orb.tsx` — rebuilt Phase 2A.1 into a compact "AI energy core": a pulsing emissive icosahedron, two thin orbital rings (`torusGeometry`) with pointer-reactive tilt, and a sparse particle halo. Sized to fit well within its camera frame with margin to spare — see the dashboard's `size-24` usage. **One canvas per page**: the dashboard mounts this once, in the welcome-hero area, rather than duplicating it in the AI insights panel lower down.
- Needed `@types/three` as a dev dependency — `three@0.187.0` ships no bundled type declarations.

## 10. Future module readiness

`src/components/future-modules/module-preview-card.tsx` — one reusable, purely presentational component for every not-yet-built module (AI workforce orchestration, Projects, Billing, Automation, Client portal, Communications, Document management, ...), rather than seven bespoke ones. Takes an icon, title, description, module accent, and an "available from" badge; applies the gradient-border utility tinted to that module's accent. No backend, no route — nothing here implies a module is implemented, per CLAUDE.md rule 6. Not currently mounted anywhere (no page references it yet); use it as the body of a future module's landing page once that module's real work begins.

## 11. Client-facing theme

A separate, deliberately plainer theme (`.theme-client-portal` in `globals.css`) for future client-facing surfaces — onboarding, agreements, payments, document uploads, project progress — none of which are built yet. Scoped by class, not a global override, so internal staff UI is never accidentally affected by it. One accent (Emerald, deepened to `#047857` for its white-text pairing — the raw swatch measures ~3.8:1 against white, short of AA; `#047857` measures ~5.5:1, checked by calculation), no gradient borders, no glass panels, no module-colour system: a client filling in a form or reviewing a document shouldn't see the same "intelligent workspace" chrome staff use internally. Not currently applied anywhere — no client-facing pages exist yet to apply it to.

## 12. Marketing site visual language

Shares the token system and typography with the app for brand consistency, but has more latitude for hero visuals and optional React Three Fiber effects — used only where they clarify the product story, kept performance-conscious (lazy-loaded, reduced-motion respecting), and never at the cost of Core Web Vitals.
