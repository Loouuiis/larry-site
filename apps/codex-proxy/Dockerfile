FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@0.107.0

WORKDIR /app
COPY apps/codex-proxy/package.json ./package.json
COPY apps/codex-proxy/server.mjs ./server.mjs

EXPOSE 3011
CMD ["npm", "run", "start"]
