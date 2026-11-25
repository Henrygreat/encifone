/**
 * Single source of truth for platform-level branding. Change the product
 * name, taglines, or package name here and it propagates everywhere that
 * imports from this module (metadata, auth pages, app shell, worker logs).
 *
 * This is distinct from per-tenant white-label branding (`Organisation.branding`,
 * see docs/DESIGN_SYSTEM.md §6) — that overrides colours/logo per organisation
 * for client portals. This file is the platform's own identity.
 */
export const branding = {
  productName: "EncifOne",
  packageName: "encifone",
  tagline: "One platform. Intelligent business.",
  secondaryTagline: "Acquire. Manage. Deliver. Automate. Grow.",
} as const;
