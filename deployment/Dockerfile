# syntax=docker/dockerfile:1.7-labs
# Public website image: build with --target runner (the migrator is separate).
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY packages/db ./packages/db
COPY apps/web ./apps/web
COPY messages ./messages

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_PATH=/etabeeb
ENV NEXT_PUBLIC_APP_URL=https://etabeeb.online

RUN npm run build --workspace=apps/web

FROM base AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json tsconfig.base.json turbo.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY packages/db ./packages/db
COPY apps/web/package.json ./apps/web/package.json
RUN ln -s /app/packages/db/src /app/src \
 && ln -s /app/packages/db/migrations /app/migrations
CMD ["npx", "drizzle-kit", "migrate", "--config", "packages/db/drizzle.config.ts"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_PUBLIC_BASE_PATH=/etabeeb
ENV NEXT_PUBLIC_APP_URL=https://etabeeb.online

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/messages ./messages
COPY --from=builder --chown=nextjs:nodejs /app/messages ./apps/web/messages
COPY --from=builder --chown=nextjs:nodejs /app/packages/db/migrations ./packages/db/migrations

RUN mkdir -p /app/private-uploads \
 && chown -R nextjs:nodejs /app/private-uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/etabeeb/api/health || exit 1

CMD ["node", "apps/web/server.js"]
