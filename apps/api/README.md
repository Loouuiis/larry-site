# Larry API (`apps/api`)

Fastify API service for Stage 1 product backend development.

## Stage 1 scope

- Multi-tenant API scaffold (`/v1` routes)
- Postgres via `@larry/db`
- Redis queue publishing via BullMQ
- OpenAI-first extraction via `@larry/ai`
- Approval-gated action flow

## Run

From repo root:

```bash
npm run api:dev
```

## Migrations

```bash
npm run db:migrate
```

## Build / Test

```bash
npm run api:build
npm run api:test
```

## Env

Copy `apps/api/.env.example` to `apps/api/.env`.

## Slack connector (new)

- `GET /v1/connectors/slack/install-url` (auth required: `admin` or `pm`)
- `GET /v1/connectors/slack/callback` (Slack OAuth redirect URI)
- `POST /v1/connectors/slack/events` (Slack Events API webhook, signed)
- `GET /v1/connectors/slack/status` (auth required)
