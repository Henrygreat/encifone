# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
# Set via `docker build --build-arg GIT_SHA=$(git rev-parse HEAD)` — see
# scripts/diagnose-deployment.sh and docs/ROLLBACK.md, which both identify
# a running/rollback-candidate image by this value. "unknown" if omitted
# (e.g. a local `docker build` without the arg) rather than failing the build.
ARG GIT_SHA=unknown

# --- Dependencies (includes devDependencies — needed for `prisma generate`,
# the Next.js build, and to run the worker via tsx in its runtime stage) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_PRODUCT_NAME
ARG NEXT_PUBLIC_PRODUCT_TAGLINE
ARG NEXT_PUBLIC_PARENT_BRAND
ARG NEXT_PUBLIC_AI_ASSISTANT_NAME
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_MARKETING_WEBSITE
ARG NEXT_PUBLIC_PLATFORM_ATTRIBUTION
# Build-time env values are placeholders — next build only needs them to be
# present and well-formed, not valid; no real secret, database, Redis, or
# third-party API credential is ever read during a build (see
# docs/DEPLOYMENT.md §7 — build-time vs. runtime configuration). Docker's
# build scanner flags ENV AUTH_SECRET as a sensitive-data pattern by name —
# this one is a fixed, public, non-secret literal baked in on purpose and
# overwritten by the real one at container runtime (docker-compose.yml);
# there is nothing here to leak.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV REDIS_URL="redis://localhost:6379"
ENV AUTH_SECRET="placeholder-build-time-secret-min-16-chars"
RUN pnpm db:generate && pnpm build

# --- Runtime: Next.js app (standalone output is self-contained) ---
FROM base AS app
# Each stage must redeclare ARGs it uses — they don't automatically carry
# over from `base` into stages built FROM it.
ARG GIT_SHA=unknown
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Docker sets HOSTNAME to the container's own id/hostname in every
# container. Next's standalone server.js reads HOSTNAME and binds to it if
# set, so without this override it binds to the container's assigned IP
# instead of all interfaces — reachable via Docker's host port-publishing
# NAT (which targets the container IP directly) but NOT via loopback from
# inside the container itself, and not reliably via every Docker network
# the container may be attached to (e.g. a Coolify-managed network plus a
# project-specific one) — only whichever interface the single bound IP
# happens to belong to. See docs/DECISION_LOG.md for the production
# incident this caused.
ENV HOSTNAME=0.0.0.0
# Explicit rather than relying on Next's own default, per docs/DEPLOYMENT.md
# §4 — must match the compose `app` service's published/internal port.
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
RUN echo "$GIT_SHA" > /app/GIT_SHA
# The standalone output is already owned by root from COPY; `node` (uid
# 1000) is the non-root user baked into the official Node image.
RUN chown -R node:node /app
USER node
EXPOSE 3000
# Checks readiness (DB/Redis), not just liveness — a container that's up
# but can't reach its dependencies should not be considered healthy.
# 127.0.0.1 (not `localhost`) avoids any IPv4/IPv6 resolution ambiguity.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

# --- Runtime: background worker ---
FROM base AS worker
ARG GIT_SHA=unknown
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
RUN echo "$GIT_SHA" > /app/GIT_SHA
RUN mkdir -p /tmp/health && chown -R node:node /app /tmp/health
USER node
# The worker has no HTTP port to probe, so health is a heartbeat file it
# touches on an interval (src/workers/index.ts) — stale means the event
# loop is stuck or the process is wedged, not just "no jobs right now".
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const fs=require('fs');try{const age=Date.now()-fs.statSync('/tmp/health/worker-heartbeat').mtimeMs;process.exit(age<45000?0:1)}catch{process.exit(1)}"]
# Invoke the tsx binary directly rather than via `pnpm exec`, which would
# otherwise make outbound registry calls on every container start.
CMD ["node_modules/.bin/tsx", "src/workers/index.ts"]
