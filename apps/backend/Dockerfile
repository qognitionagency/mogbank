FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace config and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --filter="./apps/backend" --frozen-lockfile --prod=false

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

RUN pnpm --filter="./apps/backend" run build

# ── Production stage ──
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 mogbank && adduser -u 1001 -G mogbank -s /bin/sh -D mogbank

COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/dist ./dist
COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/package.json ./
COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/node_modules ./node_modules
COPY --from=builder --chown=mogbank:mogbank /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=mogbank:mogbank /app/packages/shared/package.json ./packages/shared/

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

USER mogbank

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]