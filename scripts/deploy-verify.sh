#!/usr/bin/env bash
# Run this AFTER a deployment to verify it actually succeeded. Safe to run
# repeatedly against a live environment — every request is read-only
# (health/auth-smoke only; auth smoke test creates and leaves a throwaway
# test account, since there is no account-deletion endpoint yet — see
# docs/TESTING.md).
#
# Usage: scripts/deploy-verify.sh [base_url]
#   scripts/deploy-verify.sh                       # defaults to http://localhost:3000
#   scripts/deploy-verify.sh https://app.encifone.com
set -uo pipefail

BASE_URL="${1:-http://localhost:3000}"
failures=0
step() { echo ""; echo "=== $1 ==="; }
ok() { echo "  OK: $1"; }
bad() { echo "  FAIL: $1"; failures=$((failures + 1)); }

step "Liveness ($BASE_URL/api/health/live)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/health/live" || echo 000)
[ "$CODE" = "200" ] && ok "Live (HTTP $CODE)" || bad "Not live (HTTP $CODE)"

step "Readiness ($BASE_URL/api/health/ready)"
BODY=$(curl -s --max-time 10 "$BASE_URL/api/health/ready" || echo '{}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/health/ready" || echo 000)
echo "  Response: $BODY"
[ "$CODE" = "200" ] && ok "Ready (HTTP $CODE)" || bad "Not ready (HTTP $CODE)"

step "Legacy /api/health (backward compatibility)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/health" || echo 000)
[ "$CODE" = "200" ] && ok "OK (HTTP $CODE)" || bad "Failing (HTTP $CODE)"

step "Public pages reachable"
for path in / /login /register; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL$path" || echo 000)
  [ "$CODE" = "200" ] && ok "$path (HTTP $CODE)" || bad "$path unreachable (HTTP $CODE)"
done

step "Protected routes reject unauthenticated access correctly (not a 500)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/v1/memberships" || echo 000)
[ "$CODE" = "401" ] && ok "Correctly rejected with 401 (HTTP $CODE)" || bad "Expected 401, got HTTP $CODE"

step "Auth smoke test (register + sign in + session + authenticated API call)"
EMAIL="deploy-verify-$(date +%s)@example.com"
COOKIES=$(mktemp)
REGISTER_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Deploy Verify\",\"email\":\"$EMAIL\",\"password\":\"password123\",\"organisationName\":\"Deploy Verify Co\"}")
if [ "$REGISTER_CODE" = "201" ]; then
  ok "Registration succeeded (HTTP $REGISTER_CODE)"
  CSRF=$(curl -s -c "$COOKIES" --max-time 10 "$BASE_URL/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  SIGNIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "$BASE_URL/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" -c "$COOKIES" -b "$COOKIES" \
    --data-urlencode "email=$EMAIL" --data-urlencode "password=password123" \
    --data-urlencode "csrfToken=$CSRF" --data-urlencode "json=true")
  [ "$SIGNIN_CODE" = "200" ] && ok "Sign-in succeeded (HTTP $SIGNIN_CODE)" || bad "Sign-in failed (HTTP $SIGNIN_CODE) — check AUTH_SECRET/NEXTAUTH_URL"
  SESSION=$(curl -s --max-time 10 -b "$COOKIES" "$BASE_URL/api/auth/session")
  if echo "$SESSION" | grep -q "$EMAIL"; then
    ok "Session contains the signed-in user"
  else
    bad "Session does not reflect the signed-in user — JWT/secret likely misconfigured"
  fi
  API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -b "$COOKIES" "$BASE_URL/api/v1/organisations/me")
  [ "$API_CODE" = "200" ] && ok "Authenticated API call succeeded (HTTP $API_CODE)" || bad "Authenticated API call failed (HTTP $API_CODE)"
else
  bad "Registration failed (HTTP $REGISTER_CODE) — cannot continue auth smoke test"
fi
rm -f "$COOKIES"

echo ""
if [ "$failures" -gt 0 ]; then
  echo "DEPLOY VERIFICATION FAILED: $failures check(s) failed."
  exit 1
fi
echo "DEPLOY VERIFICATION PASSED against $BASE_URL."
