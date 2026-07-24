# syntax=docker/dockerfile:1

# =============================================================================
# liveWAB — production image
#
# Multi-stage so the shipped image contains no source, no dev dependencies and
# no build toolchain. Alpine keeps it small; the two extra packages are there
# because Prisma's query engine is a native binary that needs OpenSSL and a
# glibc shim on musl.
# =============================================================================

ARG NODE_VERSION=20.20.0

# ---------------------------------------------------------------- deps
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy only the manifests first: this layer is cached until they change, so
# code edits don't trigger a fresh dependency install.
COPY package.json package-lock.json ./
# The postinstall script runs `prisma generate`, which needs the schema.
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------- builder
FROM node:${NODE_VERSION}-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js inlines NEXT_PUBLIC_* variables at BUILD time — they are compiled
# into the client bundle, so they must be present now, not just at runtime.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
ARG NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY
ARG NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL \
    NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY=$NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY \
    NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=$NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT \
    NEXT_TELEMETRY_DISABLED=1

# A dummy DATABASE_URL: `prisma generate` insists on a value, but the build
# never opens a connection (every page is force-dynamic or client-rendered).
ENV DATABASE_URL="mongodb://placeholder:27017/build"

RUN npm run build

# ---------------------------------------------------------------- runner
FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat openssl \
  # tini reaps zombies and forwards SIGTERM, so `docker stop` is a clean
  # shutdown rather than a 10-second wait followed by SIGKILL.
  tini \
  # Used by the container healthcheck.
  wget
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Never run the server as root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `output: "standalone"` bundles the server + traced node_modules, but leaves
# static assets to be copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next's file tracing is unreliable about Prisma's native query engine — when
# it misses, the container boots fine and then throws "Query engine library
# not found" on the first database call. Copying the generated client
# explicitly makes that failure mode impossible.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Local-disk upload fallback (used only when ImageKit isn't configured).
# Declared as a volume mount point so writes survive a container replacement.
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# ---------------------------------------------------------------- worker
# Background jobs (reservation sweeper, shipment reconciliation) run the
# TypeScript sources directly via tsx, so this stage keeps the full
# node_modules and the source tree. It is never used to serve HTTP.
FROM node:${NODE_VERSION}-alpine AS worker
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S worker -G nodejs \
  && chown -R worker:nodejs /app
USER worker

ENTRYPOINT ["/sbin/tini", "--"]
# Overridden per service in docker-compose.
CMD ["npx", "tsx", "scripts/sweeper.ts"]
