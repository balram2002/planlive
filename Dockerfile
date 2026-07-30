# syntax=docker/dockerfile:1

# ----------- BASE -----------
FROM node:22-alpine AS base
WORKDIR /app
# libc6-compat: sharp's prebuilt musl binary. openssl: Prisma query engine.
RUN apk add --no-cache libc6-compat openssl tini
ENV NEXT_TELEMETRY_DISABLED=1


# ----------- DEPS -----------
FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts skips the postinstall `prisma generate`, which fails during
# install on Alpine; the builder runs it explicitly instead.
RUN npm ci --ignore-scripts


# ----------- BUILD -----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build


# ----------- WORKER -----------
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json tsconfig.json .env.local ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S worker -G nodejs \
 && chown -R worker:nodejs /app
USER worker
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "scripts/sweeper.ts"]


# ----------- RUN -----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=1024

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# standalone bundles server.js plus only the node_modules actually reached at
# runtime — copying the full tree instead would add ~1GB of dev dependencies.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs .env.local ./.env.local

RUN mkdir -p public/uploads && chown nextjs:nodejs public/uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
