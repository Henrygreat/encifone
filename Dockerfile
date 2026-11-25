# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

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
# Build-time env values are placeholders — next build only needs them to be
# present and well-formed, not valid; real secrets are injected at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV REDIS_URL="redis://localhost:6379"
ENV AUTH_SECRET="placeholder-build-time-secret-min-16-chars"
RUN pnpm db:generate && pnpm build

# --- Runtime: Next.js app (standalone output is self-contained) ---
FROM base AS app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]

# --- Runtime: background worker ---
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
# Invoke the tsx binary directly rather than via `pnpm exec`, which would
# otherwise make outbound registry calls on every container start.
CMD ["node_modules/.bin/tsx", "src/workers/index.ts"]
