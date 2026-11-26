import { z } from "zod";

/**
 * Centralised environment configuration. See docs/DEPLOYMENT.md §6 for the
 * full classification (required build-time / required runtime / optional
 * integration / dev-only / secret) and docs/DECISION_LOG.md for why this
 * validates eagerly rather than lazily.
 *
 * Fails fast at boot on missing/malformed configuration rather than
 * surfacing a confusing error deep inside a request handler later — but
 * every field here is something EVERY process that imports this module
 * needs (app, worker). Module-specific optional integrations (Stripe, AI
 * providers, etc.) are read directly via `process.env.X` at their own call
 * site with their own fallback behaviour — they must never be added here,
 * or they'd become load-bearing for processes that don't use them (see the
 * AUTH_SECRET/worker incident in docs/DECISION_LOG.md).
 */
const envSchema = z.object({
  // --- Required at runtime, every process ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // --- Required at runtime, app only (worker needs these too, only
  // because it imports this same shared schema — see docs/DECISION_LOG.md
  // on why that's a known, accepted tradeoff rather than a split schema) ---
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  // NextAuth v4's own canonical env var for the public base URL used to
  // build OAuth/callback/cookie URLs. Optional here because we default it
  // from APP_URL below when unset — see `ensureNextAuthUrl()`.
  NEXTAUTH_URL: z.string().url().optional(),
  // Explicit, not relied on as an implicit Next.js default — see
  // docs/DEPLOYMENT.md §4 (Next.js network binding).
  PORT: z.coerce.number().int().positive().default(3000),

  // --- Optional integrations: absence must never block startup ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

/**
 * NextAuth v4 reads `process.env.NEXTAUTH_URL` itself, lazily, wherever it
 * needs the public base URL — it isn't something we can hand it via the
 * `authOptions` object. So instead of requiring operators to set the same
 * URL twice under two different names, default it from APP_URL once here,
 * as a deliberate, documented side effect, imported before any auth code
 * runs (see src/lib/auth.ts). Explicitly setting NEXTAUTH_URL still wins.
 */
export function ensureNextAuthUrl() {
  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = env.APP_URL;
  }
}

ensureNextAuthUrl();
