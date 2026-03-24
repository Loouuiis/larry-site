# Build stage — context must be monorepo root
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY apps/worker ./apps/worker
COPY packages ./packages

RUN npm run build -w @larry/shared
RUN npm run build -w @larry/config
RUN npm run build -w @larry/db
RUN npm run build -w @larry/ai
RUN npm run build -w @larry/worker

# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/config/dist ./packages/config/dist

COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/dist ./packages/db/dist

COPY --from=builder /app/packages/ai/package.json ./packages/ai/
COPY --from=builder /app/packages/ai/dist ./packages/ai/dist

CMD ["node", "apps/worker/dist/worker.js"]
