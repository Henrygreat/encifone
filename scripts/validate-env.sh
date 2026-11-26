#!/usr/bin/env bash
# Validates required environment variables are present and well-formed,
# WITHOUT ever printing their values. Run this against the environment
# you're about to deploy with (e.g. `env $(cat .env | xargs) bash
# scripts/validate-env.sh`, or inside the target container).
#
# Usage: scripts/validate-env.sh
# Non-destructive: read-only, exits non-zero on the first class of failure.
set -uo pipefail

errors=0
warn() { echo "WARNING: $1"; }
fail() { echo "::error::$1"; errors=$((errors + 1)); }

require_set() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "$name is required but not set."
  fi
}

require_url() {
  local name="$1"
  local value="${!name:-}"
  [ -z "$value" ] && return 0 # require_set already reported it
  case "$value" in
    http://*|https://*) ;;
    *) fail "$name must be a full URL (http:// or https://), got: <redacted, does not start with http>" ;;
  esac
}

echo "--- Required runtime variables ---"
require_set DATABASE_URL
require_set REDIS_URL
require_set AUTH_SECRET
require_set APP_URL
require_url APP_URL

if [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    postgresql://*|postgres://*) ;;
    *) fail "DATABASE_URL does not look like a PostgreSQL connection string." ;;
  esac
  case "$DATABASE_URL" in
    *localhost*|*127.0.0.1*)
      [ "${NODE_ENV:-}" = "production" ] && fail "DATABASE_URL points at localhost while NODE_ENV=production — this is almost always wrong for a containerised deploy." ;;
  esac
fi

if [ -n "${REDIS_URL:-}" ]; then
  case "$REDIS_URL" in
    redis://*|rediss://*) ;;
    *) fail "REDIS_URL does not look like a Redis connection string." ;;
  esac
fi

if [ -n "${AUTH_SECRET:-}" ] && [ "${#AUTH_SECRET}" -lt 16 ]; then
  fail "AUTH_SECRET must be at least 16 characters."
fi

echo "--- Conflicting / commonly-missing configuration ---"
if [ "${NODE_ENV:-}" = "production" ] && [ -z "${NEXTAUTH_URL:-}" ]; then
  warn "NEXTAUTH_URL is not set — src/lib/env.ts will default it from APP_URL. Set it explicitly only if it must differ."
fi
if [ "${NODE_ENV:-}" = "production" ] && [ -n "${APP_URL:-}" ]; then
  case "$APP_URL" in
    https://*) ;;
    *) warn "NODE_ENV=production but APP_URL is not https:// — secure cookies will not be issued correctly behind a reverse proxy." ;;
  esac
fi
if [ -n "${HOSTNAME:-}" ] && [ "$HOSTNAME" != "0.0.0.0" ]; then
  fail "HOSTNAME is set to '$HOSTNAME', not 0.0.0.0 — Next's standalone server will bind to a single interface. See docs/DECISION_LOG.md."
fi
if [ -z "${PORT:-}" ]; then
  warn "PORT is not set — defaulting to 3000 (Next's default and this image's EXPOSE). Set explicitly to avoid ambiguity."
fi

echo "--- Optional integrations (absence is fine — reporting only) ---"
for pair in "GOOGLE_CLIENT_ID:GOOGLE_CLIENT_SECRET" "STRIPE_SECRET_KEY:STRIPE_WEBHOOK_SECRET"; do
  a="${pair%%:*}"; b="${pair##*:}"
  if [ -n "${!a:-}" ] && [ -z "${!b:-}" ]; then
    warn "$a is set but $b is not — that integration will likely be half-configured."
  fi
done

echo ""
if [ "$errors" -gt 0 ]; then
  echo "FAILED: $errors required-configuration error(s)."
  exit 1
fi
echo "OK: required environment variables are present and well-formed."
