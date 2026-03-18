# Larry API (`apps/api`)

Fastify API service for Stage 1 product backend development.

## Stage 1 scope

- Standalone Larry Workspace backend (`/v1` routes) as source of truth
- Multi-tenant domain + auth/RBAC/audit foundations
- Postgres via `@larry/db`
- Redis queue publishing via BullMQ
- OpenAI-first extraction via `@larry/ai`
- Approval-gated action flow
- Connector channels (Slack/Email/Calendar) feeding canonical events into workspace workflows

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

## Google Calendar connector (new)

- `GET /v1/connectors/google-calendar/install-url` (auth required: `admin` or `pm`)
- `GET /v1/connectors/google-calendar/callback` (Google OAuth redirect URI)
- `GET /v1/connectors/google-calendar/status` (auth required)
- `POST /v1/connectors/google-calendar/watch` (auth required: `admin` or `pm`)
- `POST /v1/connectors/google-calendar/webhook` (Google Calendar push webhook)
