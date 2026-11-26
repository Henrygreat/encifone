#!/usr/bin/env bash
# Comprehensive, non-destructive diagnostic report. Run this ON THE SERVER
# (needs `docker` access to the running containers) when something looks
# wrong. Never prints credential/secret values — only structural/status
# information. Safe to run at any time; makes no changes.
#
# Usage: scripts/diagnose-deployment.sh [app_container_name] [domain]
#   scripts/diagnose-deployment.sh                                 # best-effort autodetect
#   scripts/diagnose-deployment.sh clientos-ai-app-1 app.encifone.com
set -uo pipefail

APP_CONTAINER="${1:-}"
DOMAIN="${2:-}"

section() { echo ""; echo "============================================================"; echo "$1"; echo "============================================================"; }

if [ -z "$APP_CONTAINER" ]; then
  APP_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'app' | head -1 || true)
fi

section "1. Container status"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -iE 'app|worker|migrate|redis|postgres' || echo "No matching containers found."

if [ -z "$APP_CONTAINER" ]; then
  echo ""
  echo "Could not autodetect the app container — pass its name explicitly as the first argument. Skipping container-specific checks."
else
  section "2. App container: listening interfaces (inside the container)"
  docker exec "$APP_CONTAINER" node -e "
    const fs = require('fs');
    try {
      const lines = fs.readFileSync('/proc/net/tcp', 'utf8').split('\n').slice(1).filter(Boolean);
      for (const l of lines) {
        const parts = l.trim().split(/\s+/);
        const [addr, port] = parts[1].split(':');
        const octets = [0,1,2,3].map(i => parseInt(addr.slice(i*2, i*2+2), 16)).reverse();
        console.log(octets.join('.') + ':' + parseInt(port, 16));
      }
    } catch (e) { console.error('Could not read /proc/net/tcp:', e.message); }
  " 2>&1 || echo "Could not exec into $APP_CONTAINER"
  echo "(0.0.0.0:<port> means bound to all interfaces — correct. A specific IP means bound to one interface only — see docs/DECISION_LOG.md.)"

  section "3. Docker network attachments"
  docker inspect "$APP_CONTAINER" --format '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}}: {{$cfg.IPAddress}}{{"\n"}}{{end}}' 2>&1 || echo "Could not inspect $APP_CONTAINER"

  section "4. Environment variables present (names only — no values)"
  docker exec "$APP_CONTAINER" env 2>/dev/null | cut -d= -f1 | sort || echo "Could not read env from $APP_CONTAINER"

  section "5. Prisma migration status (from inside the app container, if prisma CLI is available)"
  docker exec "$APP_CONTAINER" sh -c 'command -v node_modules/.bin/prisma >/dev/null 2>&1 && node_modules/.bin/prisma migrate status || echo "prisma CLI not present in the app runtime image (expected — only the migrate image has it); check the migrate container logs instead."' 2>&1

  section "6. Application health (from inside the container, via loopback)"
  docker exec "$APP_CONTAINER" node -e "
    fetch('http://127.0.0.1:3000/api/health/ready')
      .then(async r => console.log('status:', r.status, 'body:', await r.text()))
      .catch(e => console.error('loopback fetch failed:', e.message));
  " 2>&1

  section "7. Docker-level health status"
  docker inspect "$APP_CONTAINER" --format 'Health: {{.State.Health.Status}}{{"\n"}}Restarts: {{.RestartCount}}' 2>&1
fi

section "8. Migrate container (should have exited 0, not be 'running')"
docker ps -a --filter "name=migrate" --format 'table {{.Names}}\t{{.Status}}\t{{.State}}' 2>&1

section "9. Worker container heartbeat"
WORKER_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i worker | head -1 || true)
if [ -n "$WORKER_CONTAINER" ]; then
  docker exec "$WORKER_CONTAINER" node -e "
    const fs = require('fs');
    try {
      const age = Date.now() - fs.statSync('/tmp/health/worker-heartbeat').mtimeMs;
      console.log('Heartbeat age:', age, 'ms', age < 45000 ? '(fresh)' : '(STALE)');
    } catch (e) { console.error('No heartbeat file found:', e.message); }
  " 2>&1
else
  echo "No worker container found."
fi

section "10. Traefik routing labels (if Traefik is reachable via the Docker socket on this host)"
if command -v docker >/dev/null 2>&1; then
  TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' | grep -iE 'traefik|coolify-proxy' | head -1 || true)
  if [ -n "$TRAEFIK_CONTAINER" ]; then
    echo "Traefik container: $TRAEFIK_CONTAINER"
    if [ -n "$APP_CONTAINER" ]; then
      docker inspect "$APP_CONTAINER" --format '{{range $k, $v := .Config.Labels}}{{if or (eq (slice $k 0 8) "traefik.") (eq (slice $k 0 8) "coolify.")}}{{$k}}={{$v}}{{"\n"}}{{end}}{{end}}' 2>&1 || echo "Could not read labels."
    fi
  else
    echo "No Traefik/Coolify-proxy container found on this host (or not running under that name)."
  fi
fi

section "11. Public domain accessibility + SSL (if a domain was provided)"
if [ -n "$DOMAIN" ]; then
  echo "--- HTTPS response ---"
  curl -sI --max-time 10 "https://$DOMAIN/api/health/live" || echo "Request failed."
  echo ""
  echo "--- Certificate ---"
  echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null || echo "Could not retrieve certificate (openssl not available, or connection failed)."
else
  echo "No domain provided — pass it as the second argument to check public HTTPS/SSL, e.g.: scripts/diagnose-deployment.sh $APP_CONTAINER app.encifone.com"
fi

section "12. Running application version / git commit"
if [ -n "$APP_CONTAINER" ]; then
  docker inspect "$APP_CONTAINER" --format 'Image: {{.Config.Image}}{{"\n"}}Created: {{.Created}}' 2>&1
  docker exec "$APP_CONTAINER" cat /app/GIT_SHA 2>/dev/null || echo "No /app/GIT_SHA file found — see docs/ROLLBACK.md for how to tag images with the git commit SHA going forward."
fi

echo ""
echo "Diagnostic report complete. No changes were made."
