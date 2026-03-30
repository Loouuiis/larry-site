# Single stage — avoids node_modules hoisting issues with npm workspaces
FROM node:20-alpine
WORKDIR /app

# Copy manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ai/package.json ./packages/ai/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# Copy source
COPY apps/api ./apps/api
COPY scripts ./scripts
COPY packages ./packages

# Build packages in dependency order
RUN npm run build -w @larry/shared
RUN npm run build -w @larry/config
RUN npm run build -w @larry/db
RUN npm run build -w @larry/ai
RUN npm run build -w @larry/api

EXPOSE 8080

CMD ["sh", "-c", "cd packages/db && npx tsx src/migrate.ts && cd /app && node apps/api/dist/src/server.js"]
