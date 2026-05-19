FROM node:20-alpine AS deps
WORKDIR /app

# Copy workspace config and lockfile
COPY package-lock.json pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package-lock.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN cd apps/backend && npm ci --ignore-scripts && cd ../../

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules

COPY . .

RUN cd apps/backend && npm run build

# ── Production stage ──
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -g 1001 mogbank && adduser -u 1001 -G mogbank -s /bin/sh -D mogbank

COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/dist ./dist
COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/package.json ./
COPY --from=builder --chown=mogbank:mogbank /app/apps/backend/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

USER mogbank

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]