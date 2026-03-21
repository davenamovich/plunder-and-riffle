FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY . .

# Install all deps
RUN pnpm install --no-frozen-lockfile

# Build frontend (BASE_PATH=/ for Railway)
RUN cd artifacts/btc-experiment && BASE_PATH=/ pnpm build

# Build API server
RUN cd artifacts/api-server && pnpm build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# API bundle
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Frontend static files — API will serve these
COPY --from=builder /app/artifacts/btc-experiment/dist/public ./artifacts/btc-experiment/dist/public

# DB migrations folder (required at runtime)
COPY --from=builder /app/lib/db/drizzle ./lib/db/drizzle

# Runtime node_modules for un-bundled deps
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080
ENV PORT=8080
ENV SERVE_STATIC=true
ENV STATIC_DIR=/app/artifacts/btc-experiment/dist/public

CMD ["node", "artifacts/api-server/dist/index.cjs"]
