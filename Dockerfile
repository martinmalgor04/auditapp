# syntax=docker/dockerfile:1

# ── Stage 1: deps ─────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .
ENV NODE_ENV=production
ARG DATABASE_URL=postgres://auditapp:changeme@auditapp-postgres:5432/auditapp
ARG SESSION_SECRET=build-time-placeholder-min-32-chars-long
ARG PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar
ENV DATABASE_URL=${DATABASE_URL}
ENV SESSION_SECRET=${SESSION_SECRET}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}
RUN pnpm run build && node scripts/build-migrate.mjs

# ── Stage 3: runtime ──────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=3033
ENV HOST=0.0.0.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/build ./build
COPY migrations ./migrations
COPY seed ./seed
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/database-url.mjs ./docker/database-url.mjs
COPY docker/migrate-cli.mjs ./docker/migrate-cli.mjs
COPY docker/seed-cli.mjs ./docker/seed-cli.mjs
COPY docker/seed-templates-cli.mjs ./docker/seed-templates-cli.mjs

RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3033)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3033
ENTRYPOINT ["/entrypoint.sh"]
