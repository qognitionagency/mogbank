FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --filter="./apps/web" --frozen-lockfile --prod=false

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter="./apps/web" run build

# ── Production stage ──
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 mogbank && adduser -u 1001 -G mogbank -s /bin/sh -D mogbank

COPY --from=builder --chown=mogbank:mogbank /app/apps/web/.next/standalone ./
COPY --from=builder --chown=mogbank:mogbank /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=mogbank:mogbank /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

USER mogbank

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/developers || exit 1

CMD ["node", "apps/web/server.js"]