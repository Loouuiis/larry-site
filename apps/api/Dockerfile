# Build stage — context must be monorepo root
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ai/package.json ./packages/ai/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# Copy source
COPY apps/api ./apps/api
COPY packages ./packages

# Build packages in dependency order, then api
RUN npm run build -w @larry/shared
RUN npm run build -w @larry/config
RUN npm run build -w @larry/db
RUN npm run build -w @larry/ai
RUN npm run build -w @larry/api

# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/config/dist ./packages/config/dist

COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
# Also need db src for migrations (uses tsx at runtime)
COPY --from=builder /app/packages/db/src ./packages/db/src

COPY --from=builder /app/packages/ai/package.json ./packages/ai/
COPY --from=builder /app/packages/ai/dist ./packages/ai/dist

EXPOSE 8080

# Run migrations then start the server
CMD ["sh", "-c", "cd packages/db && npx tsx src/migrate.ts && cd /app && node apps/api/dist/server.js"]
