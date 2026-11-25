# Design System — EncifOne

## 1. Principles

Premium SaaS feel inspired by Linear, Attio, Stripe, Vercel, Notion, and modern enterprise analytics dashboards — never a generic AI-generated admin template. Dense but calm: generous whitespace, clear hierarchy, no unnecessary gradients/glass effects/oversized borders/animation.

## 2. Tokens (defaults — fully overridable per tenant, see §6)

| Token | Value |
|---|---|
| `--color-primary-navy` | `#0F172A` |
| `--color-primary-blue` | `#2563EB` |
| `--color-accent-blue` | `#3B82F6` |
| `--color-accent-cyan` | `#06B6D4` |
| `--color-bg` | `#F8FAFC` |
| `--color-surface` | `#FFFFFF` |
| `--color-text-primary` | `#0F172A` |
| `--color-text-secondary` | `#64748B` |
| `--color-border` | `#E2E8F0` |
| `--color-success` | `#16A34A` |
| `--color-warning` | `#D97706` |
| `--color-error` | `#DC2626` |

Typography: Inter or Geist. Base app text 14–16px; larger type for primary dashboard figures and section headers. Dark mode: token-based palette swap, not a separate design.

## 3. Layout patterns

- **Collapsible sidebar** with the module grouping defined in the product brief (Workspace / Sales & Marketing / Client Management / Operations / Finance / Intelligence / Administration); orgs can hide modules they don't use via entitlement + preference settings.
- **Bento-grid executive dashboard**: mixed-size widget cards, user-rearrangeable/resizable (dnd-kit), never a uniform repeating KPI-card wall. Each widget: clear label, value, trend/delta, drill-down affordance, and a visible distinction between actual vs. projected figures.
- **Data tables** (TanStack Table): sticky header, column sort/resize/hide, saved views, bulk-action toolbar on selection, pagination or virtualised scroll for large sets.
- **Global command palette** (⌘K / Ctrl+K) for navigation, record search, and quick actions.
- **Forms**: React Hook Form + Zod, inline validation, clear required/optional marking, autosave where appropriate (long forms, document editors).

## 4. Component states (required for every data-bearing view)

- Skeleton loading (not spinners) for lists/cards/tables.
- Empty state: explain what the view is for and offer the primary create action — never a bare "No data."
- Error state: human-readable message + retry action; never a raw stack trace to the user.
- Confirmation dialog before any destructive or hard-to-reverse action.
- Toast notifications for background/async action results (e.g. "Invoice sent," "Import completed with 2 warnings").

## 5. Accessibility

- WCAG 2.1 AA colour contrast minimum for all text/background combinations, checked for both light and dark themes.
- Full keyboard navigation for the app shell, command palette, tables, and forms; visible focus states (Radix UI primitives provide this baseline — don't override focus rings away).
- Semantic HTML and ARIA labelling via shadcn/ui + Radix UI defaults; any custom component must match that baseline before shipping.

## 6. White-label & theming (tenant + platform configurable)

- Product name, logo, favicon, and the full colour token set above are overridable per organisation (client portal) and at the platform level (for white-label resellers, Phase 2+).
- Theme values are stored as data (`Organisation.branding` config), not hardcoded — changing them never requires a code change or redeploy.
- Client portal theming is scoped to the portal surface only; internal staff UI always uses the platform's own (or the org's chosen) theme, keeping internal tooling consistent even for heavily white-labelled client-facing portals.

## 7. Motion

Framer Motion used purposefully: page/panel transitions, drag-and-drop feedback (Kanban, dashboard widgets), subtle state-change confirmation. No decorative animation that delays comprehension or data access.

## 8. Marketing site visual language

Shares the token system and typography with the app for brand consistency, but has more latitude for hero visuals and optional React Three Fiber effects — used only where they clarify the product story, kept performance-conscious (lazy-loaded, reduced-motion respecting), and never at the cost of Core Web Vitals.
