# Design System — EncifOne

## 1. Principles

Premium SaaS feel inspired by Linear, Attio, HubSpot, Stripe, Vercel, Notion, and modern enterprise analytics dashboards — never a generic AI-generated admin template. Dense but calm: generous whitespace, clear hierarchy, purposeful colour, no unnecessary gradients/glass effects/oversized borders/decorative animation.

## 2. Tokens (defaults — fully overridable per tenant, see §6; v2 palette adopted 2026-11-26, see `docs/DECISION_LOG.md`)

Base palette (CSS custom properties, `src/app/globals.css`; light values shown — every token has a dark-mode counterpart):

| Token | Value | Role |
|---|---|---|
| `--background` | `#F5F7FC` | App background (Light Background) |
| `--foreground` | `#0B1020` | Primary text (Midnight Navy) |
| `--card` / `--popover` | `#FFFFFF` | Surfaces |
| `--primary` | `#4F46E5` | Primary actions/CTAs — one step deeper than the raw Indigo `#6366F1` swatch below for AA contrast with white text (see §5) |
| `--muted-foreground` | `#5B6478` | Secondary text |
| `--border` / `--input` | `#E3E6F0` | Hairlines, input borders |
| `--success` | `#10B981` | Emerald |
| `--warning` | `#F59E0B` | Amber |
| `--destructive` | `#E11D48` | One step deeper than the raw Rose `#F43F5E` swatch below, same AA reasoning as `--primary` |
| `--chart-1`…`--chart-5` | Indigo/Blue/Emerald/Cyan/Amber | Chart series — see Recharts usage in §4 |

Named swatches referenced above and used as literal module-accent values (§3), not all directly text-bearing: Midnight Navy `#0B1020`, Deep Navy `#111827` (dark-mode surface), Indigo `#6366F1`, Violet `#8B5CF6`, Electric Blue `#2563EB`, Emerald `#10B981`, Cyan `#06B6D4`, Amber `#F59E0B`, Rose `#F43F5E`.

Typography: Geist (already configured via `next/font/google` in `src/app/layout.tsx`) for UI, Geist Mono for monospace/code. Scale: 14–16px body, 24–32px page headings, 28–40px KPI figures (`font-heading`/`font-sans` tokens already wired in `globals.css`'s `@theme inline` block). Dark mode: token-based palette swap (`.dark` class), not a separate design.

## 3. Module accent colours

Each top-level navigation group (`src/components/app-shell/nav-config.ts`) has a dedicated accent token, used for its icons, active-state highlight, and (where a module has its own dashboard widgets) chart series belonging to it:

| Module | Token | Value (light) |
|---|---|---|
| Overview | `--module-overview` | `#6366F1` (Indigo) |
| CRM | `--module-crm` | `#F59E0B` (Amber) |
| Sales | `--module-sales` | `#10B981` (Emerald) |
| Work management | `--module-work` | `#2563EB` (Electric Blue) |
| Intelligence | `--module-intelligence` | `#8B5CF6` (Violet) |
| Administration | `--module-admin` | `#475569` (muted slate — deliberately neutral; settings shouldn't compete for attention) |

## 4. Layout patterns

- **Collapsible sidebar**, regrouped 2026-11-26 from the original 7-group product-brief IA into 6 groups — Overview / CRM / Sales / Work management / Intelligence / Administration — to match the navigation redesign requested for Phase 2A (every original item preserved, remapped: Client Management → CRM, Finance → Work management; see `docs/DECISION_LOG.md`). Orgs can hide modules they don't use via entitlement + preference settings (unimplemented — tracked in `docs/IMPLEMENTATION_STATUS.md`).
- **Bento-grid executive dashboard** (`src/components/bento/bento-grid.tsx`): mixed-size widget cards (`colSpan`/`rowSpan` 1–4), never a uniform repeating KPI-card wall. Each widget: clear label, value, trend/delta where meaningful, and a visible distinction between actual vs. projected figures. User-rearrangement (dnd-kit) is planned, not yet implemented.
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

- WCAG 2.1 AA colour contrast minimum for all text/background combinations, checked for both light and dark themes — verified by calculation for the v2 palette's two text-bearing tokens (`--primary`, `--destructive`; see §2's note on why they're one step deeper than their named swatch).
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
- `scenes/hero-network-scene.tsx` + `hero-scene.tsx` — the landing-page hero: five module-coloured nodes orbiting a wireframe core, connecting lines, `Sparkles` particles, slow rotation plus pointer-parallax. Wired into `src/app/page.tsx`, positioned behind the hero text (`absolute -z-10` + a radial scrim), never interleaved with it.
- `scenes/ai-orb-scene.tsx` + `ai-orb.tsx` — a small pulsing, distorted icosahedron (`MeshDistortMaterial`) for the dashboard's AI insights panel. Deliberately tiny (a 16×16 slot) and decorative only.
- Needed `@types/three` as a dev dependency — `three@0.187.0` ships no bundled type declarations.

## 10. Marketing site visual language

Shares the token system and typography with the app for brand consistency, but has more latitude for hero visuals and optional React Three Fiber effects — used only where they clarify the product story, kept performance-conscious (lazy-loaded, reduced-motion respecting), and never at the cost of Core Web Vitals.
