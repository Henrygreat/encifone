#!/usr/bin/env bash
# Run this BEFORE deploying — on the machine that will run `docker compose`
# (locally, or on the Hetzner server itself ahead of a Coolify deploy).
# Non-destructive: every check is read-only. Never prints secret values.
#
# Usage: scripts/deploy-preflight.sh
set -uo pipefail

cd "$(dirname "$0")/.."
failures=0
step() { echo ""; echo "=== $1 ==="; }
ok() { echo "  OK: $1"; }
bad() { echo "  FAIL: $1"; failures=$((failures + 1)); }

step "Expected production branch"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "  Current branch: $branch"
if [ "${EXPECT_BRANCH:-master}" != "$branch" ]; then
  bad "Expected branch '${EXPECT_BRANCH:-master}', currently on '$branch'. Set EXPECT_BRANCH=... to override this check."
else
  ok "On the expected branch ($branch)."
fi

step "Working tree clean"
if [ -n "$(git status --porcelain)" ]; then
  bad "Uncommitted changes present — commit or stash before deploying."
else
  ok "Working tree is clean."
fi

step "Required environment variables"
if [ -f .env ]; then
  set -a; source .env; set +a
fi
if bash scripts/validate-env.sh; then
  ok "Environment validation passed."
else
  bad "Environment validation failed (see above)."
fi

step "Docker Compose configuration"
if docker compose -f docker-compose.yml config --quiet 2>&1; then
  ok "docker-compose.yml is syntactically valid."
else
  bad "docker-compose.yml failed to parse."
fi
if docker compose -f docker-compose.yml config | grep -qE '^\s*postgres:\s*$'; then
  bad "docker-compose.yml defines a postgres service — production must use the external Coolify-managed database."
else
  ok "No postgres service in the production compose file."
fi

step "Migration integrity vs. recorded checksums"
if bash scripts/check-migration-integrity.sh; then
  ok "No previously-applied migration has been modified or deleted."
else
  bad "Migration integrity check failed — see above."
fi

step "Database connectivity (best-effort, uses DATABASE_URL from .env if present)"
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    ok "Connected to the database successfully."
  else
    bad "Could not connect to the database with the configured DATABASE_URL."
  fi
else
  echo "  SKIP: psql not available or DATABASE_URL not set in this shell — verify manually."
fi

step "Redis connectivity (best-effort)"
if [ -n "${REDIS_URL:-}" ] && command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
    ok "Connected to Redis successfully."
  else
    bad "Could not connect to Redis with the configured REDIS_URL."
  fi
else
  echo "  SKIP: redis-cli not available or REDIS_URL not set in this shell — verify manually."
fi

step "Build readiness"
if pnpm install --frozen-lockfile --silent 2>&1 | tail -5 && pnpm exec prisma validate 2>&1 | tail -3; then
  ok "Dependencies installed and schema valid."
else
  bad "Dependency install or schema validation failed."
fi

echo ""
if [ "$failures" -gt 0 ]; then
  echo "PREFLIGHT FAILED: $failures check(s) failed. Do not deploy until these are resolved."
  exit 1
fi
echo "PREFLIGHT PASSED."
