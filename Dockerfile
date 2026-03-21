FROM node:22-alpine AS builder

# bust: 2

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/btc-experiment/package.json ./artifacts/btc-experiment/
COPY artifacts/brody-video/package.json ./artifacts/brody-video/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN cd artifacts/btc-experiment && BASE_PATH=/ pnpm build
RUN cd artifacts/api-server && pnpm build

FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/btc-experiment/dist/public ./artifacts/btc-experiment/dist/public
COPY --from=builder /app/lib/db/drizzle ./lib/db/drizzle
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080
ENV PORT=8080
ENV SERVE_STATIC=true
ENV STATIC_DIR=/app/artifacts/btc-experiment/dist/public

CMD ["node", "artifacts/api-server/dist/index.cjs"]
