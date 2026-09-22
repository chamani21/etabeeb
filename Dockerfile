# syntax=docker/dockerfile:1.7-labs
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy lockfiles for reproducible installs
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/

RUN npm ci --legacy-peer-deps --prefer-offline

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (not secrets – secrets go in .env on the host)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Set base path for /etabeeb/ sub-path deployment
ENV NEXT_PUBLIC_BASE_PATH=/etabeeb

RUN npm run build --workspace=apps/web

# Enable standalone output (must be set in next.config.mjs)
# The standalone folder contains a self-contained server with minimal deps.

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy built standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static      ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public             ./apps/web/public
# Copy DB migrations so the container can run them at startup
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/migrations      ./db/migrations

# Persistent upload directory (mounted as a volume in production)
RUN mkdir -p /app/private-uploads \
 && chown nextjs:nodejs /app/private-uploads

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
