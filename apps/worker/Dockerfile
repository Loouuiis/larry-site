# Single stage — avoids node_modules hoisting issues with npm workspaces
FROM node:20-alpine
WORKDIR /app

# Copy manifests
COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# Copy source
COPY apps/worker ./apps/worker
COPY packages ./packages

# Build packages in dependency order
RUN npm run build -w @larry/shared
RUN npm run build -w @larry/config
RUN npm run build -w @larry/db
RUN npm run build -w @larry/ai
RUN npm run build -w @larry/worker

CMD ["node", "apps/worker/dist/worker.js"]
